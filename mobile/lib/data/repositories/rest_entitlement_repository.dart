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
import '../network/api_exceptions.dart';
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
    final userId = await storage.readUserId();
    if (userId == null) return EntitlementState.freeDefault;
    final deviceId = await storage.getOrCreateDeviceId();
    // Refresh first: a usable cache must not hide a server-side revocation.
    try {
      final token = await api.fetchEntitlementJwt(userId);
      final state = await _verifyFor(token, userId, deviceId);
      if (await storage.readUserId() != userId) return EntitlementState.freeDefault;
      await storage.writeEntitlementJwt(token);
      return state;
    } on JwtVerificationException {
      // A malformed/foreign signed server response is not an offline event.
      return EntitlementState.freeDefault;
    } on NetworkException {
      final cached = await storage.readEntitlementJwt();
      if (cached == null || await storage.readUserId() != userId) {
        return EntitlementState.freeDefault;
      }
      try {
        final state = await _verifyFor(cached, userId, deviceId);
        return await storage.readUserId() == userId ? state : EntitlementState.freeDefault;
      } catch (_) {
        return EntitlementState.freeDefault;
      }
    } catch (_) {
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
    if (await storage.readUserId() != userId) {
      throw JwtVerificationException('session différente');
    }
    await _verifyFor(signedToken, userId, await storage.getOrCreateDeviceId());
    if (await storage.readUserId() != userId) {
      throw JwtVerificationException('session modifiée');
    }
    // Never change the authenticated user from an entitlement token.
    await storage.writeEntitlementJwt(signedToken);
  }

  Future<EntitlementState> _verifyFor(String token, String userId, String deviceId) async {
    final verified = await _jwtVerifier.verify(token);
    final p = verified.payload;
    if (p['kind'] != 'entitlement' || p['user_id'] != userId || p['device_id'] != deviceId ||
        !['free', 'premium', 'promo'].contains(p['plan']) ||
        p['expires_at'] is! int || (p['expires_at'] as int) < 0 ||
        (p['grace_until'] != null && p['grace_until'] is! int)) {
      throw JwtVerificationException('claims entitlement invalides');
    }
    final expires = p['expires_at'] as int;
    final grace = p['grace_until'] as int?;
    // Grace never bypasses JWT expiration. Subscription and token are distinct clocks.
    return EntitlementState(
      plan: _planFromString(p['plan'] as String),
      isValid: true,
      expiresAtMs: expires < verified.expiresAtMs ? expires : verified.expiresAtMs,
      graceUntilMs: grace == null ? null : (grace < verified.expiresAtMs ? grace : verified.expiresAtMs),
    );
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
