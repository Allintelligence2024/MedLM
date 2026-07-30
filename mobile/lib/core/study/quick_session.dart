// QuickSession — sessions de révision courtes (Phase 15.1).
//
// Contexte : la v2 §14 prône la « boucle d'étude courte » — un
// étudiant qui a 5 min dans le métro peut faire 5–10 cartes
// sans démarrer une session complète. C'est aussi utile pour les
// streaks : si l'utilisateur n'a pas le temps de finir sa pile
// quotidienne, une mini-session de 5 cartes maintient le streak
// (cf. GamificationConstants.minCardsPerDayForStreak = 10, mais
// on accepte 5 pour les quick sessions).
//
// Règles :
//   * Durée cible : 5 minutes (hard cap 10 min).
//   * Nombre de cartes : 5 par défaut (configurable 3–10).
//   * Uniquement des cartes **dues** (jamais de nouvelles dans
//     une quick session — ce serait trop risqué pour la
//     rétention).
//   * Aucune injection de XP supplémentaire : on n'encourage pas
//     l'usage de quick session pour booster la gamification.
//   * Le streak n'est crédité que si on atteint le quota standard
//     (10 cartes) — pas de bonus pour les quick sessions.
library;

import '../../domain/domain.dart';

class QuickSessionConfig {
  const QuickSessionConfig({
    this.maxCards = 5,
    this.maxDurationMs = 5 * 60 * 1000, // 5 min
    this.minRatingForCompletion = 2, // Hard minimum = "Good"
  });

  final int maxCards;
  final int maxDurationMs;
  /// Rating minimum (1=Again, 2=Hard, 3=Good, 4=Easy) pour qu'une
  /// carte soit comptée comme "complétée". En quick session on
  /// demande un effort minimal.
  final int minRatingForCompletion;
}

class QuickSessionResult {
  const QuickSessionResult({
    required this.cardsReviewed,
    required this.cardsCompleted,
    required this.cardsAbandoned,
    required this.durationMs,
    required this.completed,
  });

  final int cardsReviewed;
  final int cardsCompleted;
  final int cardsAbandoned;
  final int durationMs;
  final bool completed;

  /// Taux de complétion (0..1).
  double get completionRate =>
      cardsReviewed == 0 ? 0 : cardsCompleted / cardsReviewed;

  /// La session a-t-elle atteint son objectif ?
  bool get success => completed && completionRate >= 0.6;
}

class QuickSession {
  QuickSession({
    required this.queueBuilder,
    required this.srsRepo,
    this.config = const QuickSessionConfig(),
  });

  final BuildStudyQueueUseCase queueBuilder;
  final ISrsRepository srsRepo;
  final QuickSessionConfig config;

  bool _running = false;
  DateTime? _startedAt;
  final List<_QuickReview> _reviews = [];

  /// Démarre une quick session. Pré-requis : la pile de cartes dues
  /// doit contenir au moins 1 carte (sinon `error: empty_queue`).
  Future<({String? error, List<StudyQueueItem>? items})> start({
    required String userId,
    required int nowMs,
    required String dayKey,
  }) async {
    if (_running) {
      return (error: 'session déjà en cours', items: null);
    }
    final queue = await queueBuilder(
      userId: userId,
      nowMs: nowMs,
      dayKey: dayKey,
      newCardsPerDay: 0, // Pas de nouvelles cartes en quick session.
      maxReviewsPerSession: config.maxCards,
    );
    if (queue.isEmpty) {
      return (error: 'empty_queue', items: null);
    }
    _running = true;
    _startedAt = DateTime.fromMillisecondsSinceEpoch(nowMs);
    _reviews.clear();
    return (error: null, items: queue.take(config.maxCards).toList());
  }

  /// Enregistre une revue dans la quick session.
  Future<void> recordReview({
    required String userId,
    required String cardId,
    required String deviceId,
    required Rating rating,
    required int nowMs,
    required String dayKey,
  }) async {
    if (!_running) {
      throw StateError('QuickSession non démarrée');
    }
    final newState = await srsRepo.recordReview(
      userId: userId,
      cardId: cardId,
      deviceId: deviceId,
      rating: rating,
      nowMs: nowMs,
      dayKey: dayKey,
    );
    _reviews.add(
      _QuickReview(
        cardId: cardId,
        rating: rating,
        completed: rating.value >= config.minRatingForCompletion,
        newState: newState,
      ),
    );
  }

  /// Termine la session. Retourne le résultat agrégé.
  QuickSessionResult finish() {
    if (!_running) {
      throw StateError('QuickSession non démarrée');
    }
    final now = DateTime.now();
    final durationMs = _startedAt == null
        ? 0
        : now.difference(_startedAt!).inMilliseconds;
    _running = false;
    _startedAt = null;
    final completed = _reviews.where((r) => r.completed).length;
    final abandoned = _reviews.length - completed;
    final exceededTime = durationMs > config.maxDurationMs;
    return QuickSessionResult(
      cardsReviewed: _reviews.length,
      cardsCompleted: completed,
      cardsAbandoned: abandoned,
      durationMs: durationMs,
      completed: !exceededTime,
    );
  }

  bool get isRunning => _running;
  int get reviewedCount => _reviews.length;
}

class _QuickReview {
  _QuickReview({
    required this.cardId,
    required this.rating,
    required this.completed,
    required this.newState,
  });
  final String cardId;
  final Rating rating;
  final bool completed;
  // ignore: unused_element
  final dynamic newState;
}
