/// Démarre une session d'examen blanc à partir d'un ensemble de cartes.
///
/// Choix produit important (doc v2 §4 et §10) :
///   * les événements produits pendant un examen blanc portent le drapeau
///     `examMode = true` ;
///   * ils sont **enregistrés** dans le journal pour les statistiques
///     (taux d'échec par module, par faculté…) ;
///   * mais ils sont **exclus du planificateur** par `FsrsEngine.fold` — un
///     examen blanc ne doit jamais décaler les révisions.
///
/// C'est l'enregistrement qui porte cette information, pas le use case :
/// le use case se contente de produire un identifiant de session et de
/// retourner la liste des cartes à présenter.
library;

import 'dart:math';

import '../entities/entities.dart';
import '../repositories/repositories.dart';

class MockExamSession {
  const MockExamSession({
    required this.sessionId,
    required this.cards,
    required this.startedAtMs,
  });
  final String sessionId;
  final List<StudyQueueItem> cards;
  final int startedAtMs;
}

class StartMockExamUseCase {
  const StartMockExamUseCase(this._srs, {Random? random})
      : _random = random ?? Random.secure();

  final ISrsRepository _srs;
  final Random _random;

  Future<MockExamSession> call({
    required String userId,
    required int nowMs,
    required int questionCount,
    int? seed,
  }) async {
    if (questionCount <= 0) {
      throw ArgumentError.value(
          questionCount, 'questionCount', 'doit être > 0');
    }
    // Pour l'instant, on pioche dans la file d'étude globale. Un tirage
    // stratifié par module/année viendra avec le serveur d'examens (Phase
    // 10). On conserve l'API stable pour ne pas casser les appelants.
    final List<StudyQueueItem> queue = await _srs.buildStudyQueue(
      userId: userId,
      nowMs: nowMs,
      dayKey: _dayKey(nowMs),
      newCardsPerDay: questionCount,
      maxReviewsPerSession: questionCount,
    );

    final List<StudyQueueItem> sampled = _sample(queue, questionCount,
        rng: seed != null ? Random(seed) : _random);

    final String sessionId = '${nowMs}_${_random.nextInt(1 << 32)}';
    return MockExamSession(
      sessionId: sessionId,
      cards: sampled,
      startedAtMs: nowMs,
    );
  }

  List<T> _sample<T>(List<T> source, int n, {required Random rng}) {
    if (n >= source.length) return List<T>.of(source);
    final List<T> copy = List<T>.of(source)..shuffle(rng);
    return copy.take(n).toList();
  }

  static String _dayKey(int nowMs) {
    final DateTime d = DateTime.fromMillisecondsSinceEpoch(nowMs);
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }
}
