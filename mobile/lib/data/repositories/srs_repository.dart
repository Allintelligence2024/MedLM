/// Implémentation Drift de `ISrsRepository` (couche data).
///
/// Cette classe est l'**adaptateur** entre le domaine (qui ne sait rien de
/// SQLite) et la persistance locale. Toute la logique transactionnelle et
/// les déclencheurs SQL vivent ici ; le domaine reçoit des objets purs
/// (`SrsCardState`, `ReviewEvent`).
///
/// On expose **deux** constructeurs de fait :
///   * `SrsRepository` (nom historique, conservé pour la rétro-compatibilité
///     avec les tests Phases 1-3 et l'éventuel code applicatif à venir) ;
///   * `SrsRepositoryImpl(...)` qui implémente `ISrsRepository` avec une
///     signature légèrement différente (pas de `StudyQueueConfig`, on prend
///     des scalaires).
///
/// Les deux pointent sur la même instance : on évite la duplication en
/// faisant de `SrsRepository` un typedef-like.
library;

import 'dart:convert';

import 'package:drift/drift.dart';

import '../../core/srs/fsrs_engine.dart';
import '../../core/srs/review_event.dart';
import '../../core/srs/srs_models.dart';
import '../../domain/domain.dart';
import '../local/app_database.dart';

/// Paramètres historiques de construction de la file d'étude (v2 §4).
///
/// Conservé pour la rétro-compatibilité avec les tests des Phases 1-3. Les
/// nouveaux appelants passent par `BuildStudyQueueUseCase` qui prend des
/// scalaires.
class StudyQueueConfig {
  const StudyQueueConfig({
    this.newCardsPerDay = 10,
    this.maxReviewsPerSession = 100,
    this.burySiblings = true,
  });
  final int newCardsPerDay;
  final int maxReviewsPerSession;
  final bool burySiblings;
}

/// Une carte prête à être présentée, avec son état SRS (signature historique).
///
/// Conservé pour les tests des Phases 1-3 et les éventuels ViewModels à
/// venir. Le domaine utilise `StudyQueueItem` (côté interface), qui est
/// projeté à partir de cette classe par l'adaptateur.
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

/// Adaptateur principal : implémente `ISrsRepository` ET expose l'API
/// historique utilisée par les tests des Phases 1-3.
class SrsRepository implements ISrsRepository {
  SrsRepository(this._db, {FsrsEngine engine = const FsrsEngine(), UuidV7? uuid})
      : _engine = engine,
        _uuid = uuid ?? UuidV7();

  final AppDatabase _db;
  final FsrsEngine _engine;
  final UuidV7 _uuid;

  // ── Lecture ───────────────────────────────────────────────────────────────

  @override
  Future<SrsCardState> stateFor(String userId, String cardId) async {
    final SrsStateRow? row = await (_db.select(_db.srsState)
          ..where((SrsState t) =>
              t.userId.equals(userId) & t.cardId.equals(cardId)))
        .getSingleOrNull();
    return row == null ? SrsCardState.initial : _toDomain(row);
  }

  /// API historique : file construite avec un objet de configuration.
  ///
  /// Conservée pour la rétro-compatibilité avec les tests des Phases 1-3.
  /// Les nouveaux appelants doivent utiliser `buildStudyQueue(...)` qui
  /// retourne des `StudyQueueItem` (côté domaine).
  Future<List<QueuedCard>> buildStudyQueueRaw({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    StudyQueueConfig config = const StudyQueueConfig(),
  }) {
    return _buildRaw(
      userId: userId,
      nowMs: nowMs,
      dayKey: dayKey,
      deckId: deckId,
      newCardsPerDay: config.newCardsPerDay,
      maxReviewsPerSession: config.maxReviewsPerSession,
    );
  }

  /// API historique : positional `(userId, nowMs, dayKey)` + `config` named.
  /// Conservée pour ne pas casser les tests des Phases 1-3.
  Future<List<QueuedCard>> buildStudyQueueCompat({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    StudyQueueConfig config = const StudyQueueConfig(),
  }) {
    return buildStudyQueueRaw(
      userId: userId,
      nowMs: nowMs,
      dayKey: dayKey,
      deckId: deckId,
      config: config,
    );
  }

  @override
  Future<List<StudyQueueItem>> buildStudyQueue({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    int newCardsPerDay = 10,
    int maxReviewsPerSession = 100,
  }) async {
    final List<QueuedCard> raw = await _buildRaw(
      userId: userId,
      nowMs: nowMs,
      dayKey: dayKey,
      deckId: deckId,
      newCardsPerDay: newCardsPerDay,
      maxReviewsPerSession: maxReviewsPerSession,
    );
    return raw.map(_toQueueItem).toList();
  }

  /// Surcharge historique : accepte un `StudyQueueConfig` (Phases 1-3).
  ///
  /// Conservée pour ne pas casser les tests existants. Délègue à
  /// [buildStudyQueueRaw].
  Future<List<QueuedCard>> buildStudyQueueLegacy({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    StudyQueueConfig config = const StudyQueueConfig(),
  }) {
    return buildStudyQueueRaw(
      userId: userId,
      nowMs: nowMs,
      dayKey: dayKey,
      deckId: deckId,
      config: config,
    );
  }

  Future<List<QueuedCard>> _buildRaw({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    required int newCardsPerDay,
    required int maxReviewsPerSession,
  }) async {
    final DailyCounterRow? counters = await (_db.select(_db.dailyCounters)
          ..where((DailyCounters t) =>
              t.userId.equals(userId) & t.dayKey.equals(dayKey)))
        .getSingleOrNull();

    final int reviewsLeft =
        maxReviewsPerSession - (counters?.reviewsDone ?? 0);
    final int newLeft = newCardsPerDay - (counters?.newCardsDone ?? 0);

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

  @override
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

  @override
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

      await _db.into(_db.outboxEvents).insert(OutboxEventsCompanion.insert(
            id: event.id,
            userId: userId,
            eventType: 'review',
            payloadJson: _encodeEvent(event),
            createdAt: nowMs,
          ));

      final SrsCardState next = examMode
          ? current
          : _engine.applyReview(current, rating, nowMs, cardType: cardType);

      if (!examMode) {
        await _upsertState(userId, cardId, next, nowMs);
      }

      await _bumpCounters(userId, dayKey, isNew: wasNew && !examMode);

      return next;
    });
  }

  @override
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

  @override
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

  @override
  Future<List<ReviewEvent>> pendingForPush(String userId, {int limit = 100}) {
    return (_db.select(_db.reviewLog)
          ..where((ReviewLog t) =>
              t.userId.equals(userId) & t.synced.equals(false))
          ..orderBy(<OrderClauseGenerator<ReviewLog>>[
            (ReviewLog t) => OrderingTerm.asc(t.reviewedAt),
          ])
          ..limit(limit))
        .get()
        .then((List<ReviewLogRow> rows) => rows.map(_toEvent).toList());
  }

  @override
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

  static StudyQueueItem _toQueueItem(QueuedCard q) {
    // Le contenu bilingue est désérialisé à la frontière data → domaine.
    // En cas d'échec (carte corrompue), on retombe sur le français vide : le
    // ViewModel affichera un placeholder, et la carte pourra être signalée
    // par l'étudiant (SubmitReportUseCase).
    String fr(String key, String fallback) {
      try {
        final Map<String, dynamic> j =
            jsonDecode(q.contentJson) as Map<String, dynamic>;
        final Object? c = j[key];
        if (c is Map<String, dynamic>) {
          final Object? v = c['fr'];
          if (v is String) return v;
        }
      } catch (_) {/* ignore */}
      return fallback;
    }

    String? en(String key) {
      try {
        final Map<String, dynamic> j =
            jsonDecode(q.contentJson) as Map<String, dynamic>;
        final Object? c = j[key];
        if (c is Map<String, dynamic>) {
          final Object? v = c['en'];
          if (v is String && v.isNotEmpty) return v;
        }
      } catch (_) {/* ignore */}
      return null;
    }

    return StudyQueueItem(
      cardId: q.cardId,
      deckId: q.deckId,
      cardType: q.type,
      frontTextFr: fr('front', '[carte sans front]'),
      frontTextEn: en('front'),
      backTextFr: fr('back', ''),
      backTextEn: en('back'),
      state: q.state,
    );
  }

  static String _encodeEvent(ReviewEvent e) => jsonEncode(e.toJson());
}
