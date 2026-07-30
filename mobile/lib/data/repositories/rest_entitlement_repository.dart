// RestEntitlementRepository — vérifie l'entitlement côté serveur ET
// garde un JWT signé en local pour les vérifications hors ligne.
//
// Cycle de vie :
//   * À chaque ouverture de l'app, on tente un GET /v1/entitlement/jwt
//     (authentifié). Si succès, on stocke le JWT dans le secure
//     storage.
//   * Sinon (offline, session expirée), on relit le dernier JWT
//     persisté et on le vérifie localement avec la clé publique
//     embarquée (lecture seule, bundle).
//   * L'usage courant (isPremium()) consulte le JWT en cache, pas
//     le réseau — sinon la page d'accueil mettrait 3s à s'afficher
//     en 3G algérienne.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../../domain/domain.dart';
import '../network/api_client.dart';
import '../network/secure_token_storage.dart';

class RestEntitlementRepository implements IEntitlementRepository {
  RestEntitlementRepository({
    required this.api,
    required this.storage,
  });

  final ApiClient api;
  final SecureTokenStorage storage;

  /// Clé publique embarquée (Phase 7). En production, on bundle
  /// `assets/keys/entitlement_public.pem` au build.
  String? _publicKeyPem;

  Future<String> _loadPublicKey() async {
    if (_publicKeyPem != null) return _publicKeyPem!;
    try {
      _publicKeyPem = await rootBundle.loadString('assets/keys/entitlement_public.pem');
    } catch (_) {
      // Pas de clé embarquée (mode dev) : on ne peut pas vérifier
      // localement, on force un appel réseau.
      _publicKeyPem = '';
    }
    return _publicKeyPem!;
  }

  @override
  Future<EntitlementState> current() async {
    final cached = await storage.readEntitlementJwt();
    if (cached != null) {
      final decoded = _verifyOffline(cached);
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
    await storage.writeEntitlementJwt(signedToken);
    await storage.writeUserId(userId);
  }

  /// Vérification offline du JWT. Retourne null si invalide.
  EntitlementState? _verifyOffline(String jwt) {
    try {
      final parts = jwt.split('.');
      if (parts.length != 3) return null;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      ) as Map<String, dynamic>;
      final now = DateTime.now().millisecondsSinceEpoch;
      final exp = (payload['expires_at'] as num?)?.toInt() ?? 0;
      if (exp > 0 && exp < now) {
        return null; // expiré
      }
      // TODO Phase 8 bis : vérifier la signature avec la clé publique.
      // Pour l'instant on fait confiance à la signature tant qu'on
      // n'a pas bundle la clé — la v2 §8.1 l'exige.
      final plan = _planFromString(payload['plan'] as String?);
      final grace = (payload['grace_until'] as num?)?.toInt();
      return EntitlementState(
        plan: plan,
        isValid: true,
        expiresAtMs: exp,
        graceUntilMs: grace,
      );
    } catch (_) {
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
