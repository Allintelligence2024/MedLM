// RestSyncRepository — implémentation REST de ISyncRepository.
//
// C'est le pendant serveur de `SyncOutboxUseCase`. Les deux repos
// partagent le contrat : `pushPending` + `pullSince` + `markAllSynced`.
// Côté mobile, le repository joue le rôle de la couche transport.
//
// Stratégie offline-first (doc v2 §14) :
//   * Le journal local (Drift) reste la source de vérité en mode
//     avion.
//   * On push seulement ce qui n'est pas déjà `synced=true`.
//   * Si le push échoue (réseau, throttle), on retente plus tard
//     via WorkManager (Phase 8 bis) sans rien perdre.
library;

import 'dart:async';

import '../../core/srs/review_event.dart';
import '../../core/srs/srs_models.dart';
import '../../domain/domain.dart';
import '../local/app_database.dart';
import '../network/api_client.dart';

class RestSyncRepository implements ISyncRepository {
  RestSyncRepository({
    required this.api,
    required this.db,
  });

  final ApiClient api;
  final AppDatabase db;

  @override
  Future<SyncPushOutcome> pushPending({
    required String userId,
    required String deviceId,
    int maxBatch = 100,
  }) async {
    // 1. Récupère les events locaux non encore synchronisés.
    final List<ReviewLogRow> pending = await (_db.select(_db.reviewLog)
          ..where(($t) => $t.userId.equals(userId) & $t.synced.equals(false))
          ..limit(maxBatch))
          .get();
    if (pending.isEmpty) {
      return const SyncPushOutcome(acceptedIds: <String>[]);
    }

    // 2. Mappe en ReviewEvent (le format exact attendu par le serveur).
    final List<ReviewEvent> events = pending
        .map(
          (r) => ReviewEvent(
            id: r.id,
            cardId: r.cardId,
            userId: r.userId,
            deviceId: r.deviceId,
            rating: Rating.fromValue(r.rating),
            reviewedAtMs: r.reviewedAt,
            durationMs: r.durationMs,
            cardType: CardType.fromWire(r.cardType),
            examMode: r.examMode,
          ),
        )
        .toList();

    // 3. POST /v1/srs-sync/push.
    final Map<String, dynamic> res = await api.pushSyncEvents(userId, events);

    // 4. Marque les acceptés comme synced. Les rejetés restent à
    //    renvoyer plus tard (avec diagnostic).
    final List<dynamic> accepted = res['accepted'] as List<dynamic>;
    final List<String> acceptedIds =
        accepted.map((dynamic e) => e as String).toList();
    if (acceptedIds.isNotEmpty) {
      await _db.transaction(() async {
        for (final String id in acceptedIds) {
          await (_db.update(_db.reviewLog)..where(($t) => $t.id.equals(id)))
              .write(const ReviewLogCompanion(synced: Value<bool>(true)));
        }
      });
    }
    return SyncPushOutcome(
      acceptedIds: acceptedIds,
      rejectedIds: ((res['rejected'] as List<dynamic>?) ?? <dynamic>[])
          .map((dynamic e) => (e as Map)['id'] as String)
          .toList(),
    );
  }

  @override
  Future<SyncPullOutcome> pullSince({
    required String userId,
    required String deviceId,
    required int sinceMs,
  }) async {
    final Map<String, dynamic> res = await api.pullSyncEvents(
      userId,
      sinceMs: sinceMs,
      limit: 200,
    );
    final List<dynamic> raw = res['events'] as List<dynamic>;
    final int nextCursor = (res['next_cursor_ms'] as num).toInt();

    // 1. Insère les events distants dans le journal local (append-only).
    final List<ReviewEvent> events = <ReviewEvent>[];
    for (final dynamic raw_ in raw) {
      final Map<String, dynamic> m = raw_ as Map<String, dynamic>;
      events.add(ReviewEvent.fromJson(m));
    }
    if (events.isNotEmpty) {
      await _db.transaction(() async {
        for (final ReviewEvent e in events) {
          try {
            await _db.into(_db.reviewLog).insert(ReviewLogCompanion.insert(
              id: e.id,
              userId: e.userId,
              cardId: e.cardId,
              deviceId: e.deviceId,
              rating: e.rating.value,
              durationMs: Value<int>(e.durationMs),
              cardType: e.cardType.wire,
              examMode: Value<bool>(e.examMode),
              reviewedAt: e.reviewedAtMs,
            ));
          } catch (_) {
            // Doublon (event.id déjà présent) : on ignore, c'est
            // précisément le scénario multi-appareil.
          }
        }
      });
    }
    return SyncPullOutcome(events: events, nextCursorMs: nextCursor);
  }

  @override
  Future<void> markAllSynced(String userId, Iterable<String> eventIds) async {
    final List<String> ids = eventIds.toList();
    if (ids.isEmpty) return;
    await (_db.update(_db.reviewLog)..where(($t) => $t.id.isIn(ids)))
        .write(const ReviewLogCompanion(synced: Value<bool>(true)));
  }
}
