// RestEntitlementRepository — vérifie l'entitlement côté serveur ET
// garde un JWT signé en local pour les vérifications hors ligne.
//
// Phase 8 bis :
//   * Le JWT est maintenant vérifié **cryptographiquement** avec
//     la clé publique embarquée (cf. v2 §8.1). Sans bundle de clé,
//     on refuse systématiquement (mode fail-closed).
//   * Le composant `JwtVerifier` est injecté pour faciliter les
//     tests (on peut passer un mock).
library;

import 'dart:async';

import '../../core/security/jwt_verifier.dart';
import '../../domain/domain.dart';
import '../network/api_client.dart';
import '../network/secure_token_storage.dart';

class RestEntitlementRepository implements IEntitlementRepository {
  RestEntitlementRepository({
    required this.api,
    required this.storage,
    JwtVerifier? jwtVerifier,
  }) : _jwtVerifier = jwtVerifier ?? JwtVerifier();

  final ApiClient api;
  final SecureTokenStorage storage;
  final JwtVerifier _jwtVerifier;

  @override
  Future<EntitlementState> current() async {
    final cached = await storage.readEntitlementJwt();
    if (cached != null) {
      final decoded = await _verifyOffline(cached);
      if (decoded != null) {
        return decoded;
      }
      // JWT expiré ou signature invalide : on tentera un refresh
      // réseau.
    }
    // Pas de cache utilisable : on demande au serveur.
    final userId = await storage.readUserId();
    if (userId == null) {
      return EntitlementState.freeDefault;
    }
    try {
      final Map<String, dynamic> raw = await api.fetchEntitlement(userId);
      final plan = _planFromString(raw['plan'] as String?);
      final expiresAt = (raw['expires_at_ms'] as num?)?.toInt() ?? 0;
      final graceUntil = (raw['grace_until_ms'] as num?)?.toInt();
      final isActive = raw['is_active'] as bool? ?? false;
      return EntitlementState(
        plan: plan,
        isValid: isActive,
        expiresAtMs: expiresAt,
        graceUntilMs: graceUntil,
      );
    } catch (_) {
      // Offline + pas de cache : on reste en free.
      return EntitlementState.freeDefault;
    }
  }

  @override
  Future<void> storeToken({
    required String userId,
    required String signedToken,
    required int expiresAtMs,
    int? graceUntilMs,
  }) async {
    // On vérifie le JWT qu'on s'apprête à stocker — c'est notre
    // dernière chance de refuser un token forgé.
    final verified = await _jwtVerifier.verify(signedToken);
    await storage.writeEntitlementJwt(signedToken);
    await storage.writeUserId(userId);
    // `verified` est utilisé comme effet de bord (throw si invalide).
    verified.expiresAtMs;
  }

  /// Vérification offline du JWT. Retourne null si invalide.
  Future<EntitlementState?> _verifyOffline(String jwt) async {
    try {
      final verified = await _jwtVerifier.verify(jwt);
      final p = verified.payload;
      final plan = _planFromString(p['plan'] as String?);
      final grace = (p['grace_until'] as num?)?.toInt();
      return EntitlementState(
        plan: plan,
        isValid: true,
        expiresAtMs: verified.expiresAtMs,
        graceUntilMs: grace,
      );
    } on JwtVerificationException {
      return null;
    }
  }

  EntitlementPlan _planFromString(String? s) {
    switch (s) {
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
