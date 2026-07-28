/// Accès aux données SRS : journal, projection d'état et file d'étude.
///
/// Règle structurante : **toute revue s'écrit d'abord dans le journal**, dans
/// la même transaction que la mise à jour de l'état et l'ajout à la file de
/// sortie. Si l'application est tuée juste après, rien n'est perdu et rien
/// n'est incohérent — l'état est de toute façon recalculable depuis le journal.
library;

import 'dart:convert';

import 'package:drift/drift.dart';

import '../../core/srs/fsrs_engine.dart';
import '../../core/srs/review_event.dart';
import '../../core/srs/srs_models.dart';
import '../local/app_database.dart';

/// Paramètres de construction de la file d'étude (v2 §4).
class StudyQueueConfig {
  const StudyQueueConfig({
    this.newCardsPerDay = 10,
    this.maxReviewsPerSession = 100,
    this.burySiblings = true,
  });

  /// Nouvelles cartes introduites par jour (5 / 10 / 20 côté réglages).
  final int newCardsPerDay;

  /// Plafond de revues par séance, garde-fou anti-burnout.
  final int maxReviewsPerSession;

  final bool burySiblings;
}

/// Une carte prête à être présentée, avec son état SRS.
class QueuedCard {
  const QueuedCard({
    required this.cardId,
    required this.deckId,
    required this.type,
    required this.contentJson,
    required this.state,
  });

  final String cardId;
  final String deckId;
  final CardType type;
  final String contentJson;
  final SrsCardState state;
}

class SrsRepository {
  SrsRepository(this._db, {FsrsEngine engine = const FsrsEngine(), UuidV7? uuid})
      : _engine = engine,
        _uuid = uuid ?? UuidV7();

  final AppDatabase _db;
  final FsrsEngine _engine;
  final UuidV7 _uuid;

  // ── Lecture ───────────────────────────────────────────────────────────────

  /// État courant d'une carte, ou l'état initial si elle n'a jamais été vue.
  Future<SrsCardState> stateFor(String userId, String cardId) async {
    final SrsStateRow? row = await (_db.select(_db.srsState)
          ..where((SrsState t) =>
              t.userId.equals(userId) & t.cardId.equals(cardId)))
        .getSingleOrNull();
    return row == null ? SrsCardState.initial : _toDomain(row);
  }

  /// Construit la file d'étude : revues dues d'abord, puis nouvelles cartes.
  ///
  /// L'ordre suit la règle v2 : « revues dues > nouvelles cartes ». On ne
  /// présente jamais une carte enterrée ni au-delà des plafonds du jour.
  Future<List<QueuedCard>> buildStudyQueue({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    StudyQueueConfig config = const StudyQueueConfig(),
  }) async {
    final DailyCounterRow? counters = await (_db.select(_db.dailyCounters)
          ..where((DailyCounters t) =>
              t.userId.equals(userId) & t.dayKey.equals(dayKey)))
        .getSingleOrNull();

    final int reviewsLeft =
        config.maxReviewsPerSession - (counters?.reviewsDone ?? 0);
    final int newLeft = config.newCardsPerDay - (counters?.newCardsDone ?? 0);

    final List<QueuedCard> queue = <QueuedCard>[];

    if (reviewsLeft > 0) {
      queue.addAll(await _fetch(
        userId: userId,
        deckId: deckId,
        limit: reviewsLeft,
        newCards: false,
        nowMs: nowMs,
      ));
    }
    if (newLeft > 0) {
      queue.addAll(await _fetch(
        userId: userId,
        deckId: deckId,
        limit: newLeft,
        newCards: true,
        nowMs: nowMs,
      ));
    }
    return queue;
  }

  Future<List<QueuedCard>> _fetch({
    required String userId,
    required String? deckId,
    required int limit,
    required bool newCards,
    required int nowMs,
  }) async {
    final String stateFilter = newCards
        ? "s.state = 'new'"
        : "s.state != 'new' AND s.due_ms <= :now "
            'AND (s.buried_until_ms IS NULL OR s.buried_until_ms <= :now)';
    final String deckFilter = deckId == null ? '' : 'AND c.deck_id = :deck ';
    final String order = newCards ? 'c.id' : 's.due_ms';

    final List<QueryRow> rows = await _db
        .customSelect(
          'SELECT c.id, c.deck_id, c.type, c.content_json, s.* '
          'FROM srs_state s JOIN local_cards c ON c.id = s.card_id '
          'WHERE s.user_id = :user AND $stateFilter $deckFilter'
          'ORDER BY $order LIMIT :limit',
          variables: <Variable<Object>>[
            Variable<String>(userId),
            if (!newCards) Variable<int>(nowMs),
            if (deckId != null) Variable<String>(deckId),
            Variable<int>(limit),
          ],
          readsFrom: <ResultSetImplementation<dynamic, dynamic>>{
            _db.srsState,
            _db.localCards,
          },
        )
        .get();

    return rows
        .map((QueryRow r) => QueuedCard(
              cardId: r.read<String>('id'),
              deckId: r.read<String>('deck_id'),
              type: CardType.fromWire(r.read<String>('type')),
              contentJson: r.read<String>('content_json'),
              state: SrsCardState(
                state: CardState.fromWire(r.read<String>('state')),
                stability: r.read<double>('stability'),
                difficulty: r.read<double>('difficulty'),
                elapsedDays: r.read<int>('elapsed_days'),
                scheduledDays: r.read<int>('scheduled_days'),
                reps: r.read<int>('reps'),
                lapses: r.read<int>('lapses'),
                lastReviewMs: r.read<int?>('last_review_ms'),
                dueMs: r.read<int?>('due_ms'),
                isLeech: r.read<bool>('is_leech'),
              ),
            ))
        .toList();
  }

  /// Nombre de cartes dues, pour le tableau de bord.
  Future<int> dueCount(String userId, int nowMs) async {
    final QueryRow row = await _db.customSelect(
      'SELECT count(*) AS n FROM srs_state WHERE user_id = :u '
      "AND state != 'new' AND due_ms <= :now "
      'AND (buried_until_ms IS NULL OR buried_until_ms <= :now)',
      variables: <Variable<Object>>[
        Variable<String>(userId),
        Variable<int>(nowMs),
      ],
      readsFrom: <ResultSetImplementation<dynamic, dynamic>>{_db.srsState},
    ).getSingle();
    return row.read<int>('n');
  }

  // ── Écriture ──────────────────────────────────────────────────────────────

  /// Enregistre une revue : journal, état et file de sortie, atomiquement.
  ///
  /// Retourne le nouvel état de la carte.
  Future<SrsCardState> recordReview({
    required String userId,
    required String cardId,
    required String deviceId,
    required Rating rating,
    required int nowMs,
    required String dayKey,
    CardType cardType = CardType.basic,
    int durationMs = 0,
    bool examMode = false,
  }) async {
    return _db.transaction<SrsCardState>(() async {
      final SrsCardState current = await stateFor(userId, cardId);
      final bool wasNew = current.state == CardState.newCard;

      final ReviewEvent event = ReviewEvent(
        id: _uuid.generate(nowMs: nowMs),
        cardId: cardId,
        userId: userId,
        deviceId: deviceId,
        rating: rating,
        reviewedAtMs: nowMs,
        durationMs: durationMs,
        cardType: cardType,
        examMode: examMode,
      );

      // 1. Le journal d'abord : c'est la seule écriture réellement critique.
      await _db.into(_db.reviewLog).insert(ReviewLogCompanion.insert(
            id: event.id,
            userId: userId,
            cardId: cardId,
            deviceId: deviceId,
            rating: rating.value,
            durationMs: Value<int>(durationMs),
            cardType: cardType.wire,
            examMode: Value<bool>(examMode),
            reviewedAt: nowMs,
            receivedAt: nowMs,
          ));

      // 2. File de sortie, pour la synchronisation différée.
      await _db.into(_db.outboxEvents).insert(OutboxEventsCompanion.insert(
            id: event.id,
            userId: userId,
            eventType: 'review',
            payloadJson: _encodeEvent(event),
            createdAt: nowMs,
          ));

      // 3. Projection : un examen blanc ne décale jamais la planification.
      final SrsCardState next = examMode
          ? current
          : _engine.applyReview(current, rating, nowMs, cardType: cardType);

      if (!examMode) {
        await _upsertState(userId, cardId, next, nowMs);
      }

      // 4. Compteurs du jour (plafonds de la file d'étude).
      await _bumpCounters(userId, dayKey, isNew: wasNew && !examMode);

      return next;
    });
  }

  /// Reconstruit l'état d'une carte en rejouant tout son journal.
  ///
  /// Utilisé après une synchronisation (Phase 8) ou pour réparer une
  /// incohérence : `fold` étant déterministe, le résultat est garanti correct.
  Future<SrsCardState> rebuildFromLog({
    required String userId,
    required String cardId,
    required int nowMs,
  }) async {
    final List<ReviewLogRow> rows = await (_db.select(_db.reviewLog)
          ..where((ReviewLog t) =>
              t.userId.equals(userId) & t.cardId.equals(cardId))
          ..orderBy(<OrderClauseGenerator<ReviewLog>>[
            (ReviewLog t) => OrderingTerm.asc(t.reviewedAt),
            (ReviewLog t) => OrderingTerm.asc(t.id),
          ]))
        .get();

    final SrsCardState state = _engine.fold(rows.map(_toEvent));
    await _upsertState(userId, cardId, state, nowMs);
    return state;
  }

  /// Reporte une carte au lendemain (bury siblings).
  Future<void> bury({
    required String userId,
    required String cardId,
    required int untilMs,
  }) async {
    await (_db.update(_db.srsState)
          ..where((SrsState t) =>
              t.userId.equals(userId) & t.cardId.equals(cardId)))
        .write(SrsStateCompanion(buriedUntilMs: Value<int>(untilMs)));
  }

  /// Événements en attente d'envoi, les plus anciens d'abord.
  ///
  /// Le lot est plafonné : le protocole limite un push à 100 événements.
  Future<List<ReviewLogRow>> pendingForPush(String userId,
      {int limit = 100}) {
    return (_db.select(_db.reviewLog)
          ..where((ReviewLog t) =>
              t.userId.equals(userId) & t.synced.equals(false))
          ..orderBy(<OrderClauseGenerator<ReviewLog>>[
            (ReviewLog t) => OrderingTerm.asc(t.reviewedAt),
          ])
          ..limit(limit))
        .get();
    }

  /// Marque des revues comme transmises. N'altère pas leur contenu.
  Future<void> markSynced(List<String> eventIds) async {
    if (eventIds.isEmpty) return;
    await (_db.update(_db.reviewLog)..where((ReviewLog t) => t.id.isIn(eventIds)))
        .write(const ReviewLogCompanion(synced: Value<bool>(true)));
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  Future<void> _upsertState(
      String userId, String cardId, SrsCardState s, int nowMs) {
    return _db.into(_db.srsState).insertOnConflictUpdate(
          SrsStateCompanion.insert(
            userId: userId,
            cardId: cardId,
            state: Value<String>(s.state.wire),
            stability: Value<double>(s.stability),
            difficulty: Value<double>(s.difficulty),
            elapsedDays: Value<int>(s.elapsedDays),
            scheduledDays: Value<int>(s.scheduledDays),
            reps: Value<int>(s.reps),
            lapses: Value<int>(s.lapses),
            lastReviewMs: Value<int?>(s.lastReviewMs),
            dueMs: Value<int?>(s.dueMs),
            isLeech: Value<bool>(s.isLeech),
            updatedAt: nowMs,
          ),
        );
  }

  Future<void> _bumpCounters(String userId, String dayKey,
      {required bool isNew}) {
    return _db.customStatement(
      'INSERT INTO daily_counters (user_id, day_key, new_cards_done, reviews_done) '
      'VALUES (?, ?, ?, 1) '
      'ON CONFLICT (user_id, day_key) DO UPDATE SET '
      'new_cards_done = new_cards_done + excluded.new_cards_done, '
      'reviews_done = reviews_done + 1',
      <Object>[userId, dayKey, isNew ? 1 : 0],
    );
  }

  static SrsCardState _toDomain(SrsStateRow r) => SrsCardState(
        state: CardState.fromWire(r.state),
        stability: r.stability,
        difficulty: r.difficulty,
        elapsedDays: r.elapsedDays,
        scheduledDays: r.scheduledDays,
        reps: r.reps,
        lapses: r.lapses,
        lastReviewMs: r.lastReviewMs,
        dueMs: r.dueMs,
        isLeech: r.isLeech,
      );

  static ReviewEvent _toEvent(ReviewLogRow r) => ReviewEvent(
        id: r.id,
        cardId: r.cardId,
        userId: r.userId,
        deviceId: r.deviceId,
        rating: Rating.fromValue(r.rating),
        reviewedAtMs: r.reviewedAt,
        durationMs: r.durationMs,
        cardType: CardType.fromWire(r.cardType),
        examMode: r.examMode,
      );

  static String _encodeEvent(ReviewEvent e) => jsonEncode(e.toJson());
}
