/// Adaptateur `IEntitlementRepository` (couche data).
///
/// Phase 4 : on stocke/relit le JWT dans la table `entitlement` (déjà
/// présente dans le schéma v2). La vérification de signature RS256 viendra
/// avec la Phase 7 — pour l'instant on lit le token tel quel et on expose
/// un `EntitlementState` dérivé des colonnes `plan` / `expires_at` / `grace_until`.
///
/// Important : le serveur reste l'unique source de vérité du premium
/// (doc v2 §8.1). Cette classe n'effectue aucun appel réseau ; elle
/// n'est qu'un **cache** dont la fraîcheur est gérée par la couche de
/// synchronisation.
library;

import 'package:drift/drift.dart';

import '../../domain/domain.dart';
import '../local/app_database.dart';

class EntitlementRepository implements IEntitlementRepository {
  EntitlementRepository(this._db);

  final AppDatabase _db;

  @override
  Future<EntitlementState> current() async {
    final EntitlementRow? row = await (_db.select(_db.entitlement)
          ..where((Entitlement t) => t.userId.equals('local')))
        .getSingleOrNull();
    if (row == null) return EntitlementState.freeDefault;
    return EntitlementState(
      plan: _planFromWire(row.plan),
      isValid: row.expiresAt != null && row.expiresAt! > _nowMs(),
      expiresAtMs: row.expiresAt ?? 0,
      graceUntilMs: row.graceUntil,
    );
  }

  @override
  Future<void> storeToken({
    required String userId,
    required String signedToken,
    required int expiresAtMs,
    int? graceUntilMs,
  }) async {
    await _db.into(_db.entitlement).insertOnConflictUpdate(
          EntitlementCompanion.insert(
            userId: userId,
            plan: const Value<String>('premium'),
            signedToken: Value<String>(signedToken),
            expiresAt: Value<int>(expiresAtMs),
            graceUntil: Value<int?>(graceUntilMs),
            refreshedAt:
                Value<int>(DateTime.now().millisecondsSinceEpoch),
          ),
        );
  }

  static int _nowMs() => DateTime.now().millisecondsSinceEpoch;

  static EntitlementPlan _planFromWire(String wire) {
    switch (wire) {
      case 'premium':
        return EntitlementPlan.premium;
      case 'promo':
        return EntitlementPlan.promo;
      case 'free':
      default:
        return EntitlementPlan.free;
    }
  }
}
