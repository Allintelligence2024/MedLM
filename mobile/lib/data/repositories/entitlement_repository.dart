/// Legacy Drift cache retained for compatibility, NOT an authority for premium.
/// It has no authenticated user/device binding or cryptographic verification.
/// Fail closed; the production AppContainer uses RestEntitlementRepository.
library;

import 'package:drift/drift.dart';

import '../../domain/domain.dart';
import '../local/app_database.dart';
import '../local/tables.dart';

@Deprecated('Use RestEntitlementRepository with signed, identity-bound claims')
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
      isValid: false, // Unverified legacy rows cannot grant access, even in grace.
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
