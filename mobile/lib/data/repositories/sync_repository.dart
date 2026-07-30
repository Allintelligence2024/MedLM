/// Adaptateur `ISyncRepository` (couche data) — squelette Phase 4.
///
/// Cette implémentation est volontairement **statique** : elle n'effectue
/// aucun appel réseau. Elle existe pour que les use cases (et leurs tests)
/// puissent s'exécuter sans backend, et pour que la couche présentation
/// (ViewModels) ait un contrat stable à respecter.
///
/// Phase 6 câblera une vraie implémentation `RestSyncRepository` basée sur
/// `dio` + JWT. Le remplacement se fait par injection de dépendances :
/// le use case `SyncOutboxUseCase` ne dépend que de `ISyncRepository`.
library;

import '../../domain/domain.dart';
import '../local/app_database.dart';

class LocalSyncRepository implements ISyncRepository {
  LocalSyncRepository(this._db);

  final AppDatabase _db;

  @override
  Future<SyncPushOutcome> pushPending({
    required String userId,
    required String deviceId,
    int maxBatch = 100,
  }) async {
    // Phase 4 : on marque tout comme synchronisé pour que la file de sortie
    // ne s'accumule pas en local. C'est un comportement dégradé honnête
    // (l'app reste offline-only) qui sera remplacé en Phase 6.
    final List<ReviewLogRow> pending = await (_db.select(_db.reviewLog)
          ..where((ReviewLog t) =>
              t.userId.equals(userId) & t.synced.equals(false))
          ..limit(maxBatch))
        .get();
    await (_db.update(_db.reviewLog)
          ..where((ReviewLog t) =>
              t.userId.equals(userId) & t.id.isIn(pending.map((ReviewLogRow r) => r.id))))
        .write(const ReviewLogCompanion(synced: Value<bool>(true)));
    return SyncPushOutcome(
      acceptedIds: pending.map((ReviewLogRow r) => r.id).toList(),
    );
  }

  @override
  Future<SyncPullOutcome> pullSince({
    required String userId,
    required String deviceId,
    required int sinceMs,
  }) async {
    // Pas de serveur : pas d'événements distants à récupérer.
    return const SyncPullOutcome(events: <ReviewEvent>[], nextCursorMs: 0);
  }

  @override
  Future<void> markAllSynced(
      String userId, Iterable<String> eventIds) async {
    final List<String> ids = eventIds.toList();
    if (ids.isEmpty) return;
    await (_db.update(_db.reviewLog)
          ..where((ReviewLog t) => t.id.isIn(ids)))
        .write(const ReviewLogCompanion(synced: Value<bool>(true)));
  }
}
