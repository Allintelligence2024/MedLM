// JwtVerifier — vérifie cryptographiquement la signature RS256 d'un
// JWT d'entitlement à l'aide de la clé publique embarquée.
//
// v2 §8.1 : « vérifiable offline via clé publique ». Sans cette
// vérification, un attaquant ayant accès au secure storage pourrait
// forger un JWT `plan: premium` et contourner le paywall.
//
// Implémentation :
//   * On décode le header pour lire `alg` (refus si != RS256) et
//     `kid` (optionnel, support futur de la rotation).
//   * On décode le payload SANS le vérifier (juste pour la forme).
//   * On recompose `signingInput = base64url(header) + "." + base64url(payload)`.
//   * On vérifie la signature avec la clé publique RSA-2048 et
//     SHA-256 (PKCS#1 v1.5 padding).
//   * Si la signature est OK, on vérifie les claims temporels
//     (`exp`, `nbf`).
//
// On utilise le package `cryptography` qui supporte RSA-PKCS1v1.5
// SHA-256 sans dépendance native (implémentation Dart pure).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/services.dart' show rootBundle;

class JwtVerified {
  JwtVerified({required this.payload, required this.expiresAtMs});
  final Map<String, dynamic> payload;
  final int expiresAtMs;
}

class JwtVerificationException implements Exception {
  JwtVerificationException(this.message);
  final String message;
  @override
  String toString() => 'JwtVerificationException: $message';
}

class JwtVerifier {
  JwtVerifier({this.publicKeyAssetPath = 'assets/keys/entitlement_public.pem'});

  final String publicKeyAssetPath;

  String? _cachedPem;

  Future<String> _loadPublicKeyPem() async {
    if (_cachedPem != null) return _cachedPem!;
    try {
      _cachedPem = (await rootBundle.loadString(publicKeyAssetPath)).trim();
    } catch (_) {
      // Pas de clé bundle (mode dev / build cassé) : on refuse
      // systématiquement la vérification. La v2 §8.1 l'interdit.
      throw JwtVerificationException(
        'clé publique manquante — vérification impossible',
      );
    }
    return _cachedPem!;
  }

  /// Vérifie la signature RS256 et la validité temporelle du JWT.
  /// Lève `JwtVerificationException` en cas d'échec.
  Future<JwtVerified> verify(String jwt, {DateTime? now}) async {
    final parts = jwt.split('.');
    if (parts.length != 3) {
      throw JwtVerificationException('JWT mal formé');
    }
    final header = _decodeJson(parts[0]);
    final payload = _decodeJson(parts[1]);
    if (header['alg'] != 'RS256') {
      throw JwtVerificationException('algorithme non supporté : ${header['alg']}');
    }

    // Vérification de la signature.
    final pem = await _loadPublicKeyPem();
    final algorithm = RsaPkcs1v15Sha256();
    final publicKey = SimplePublicKey(
      _stripPemEnvelope(pem),
      type: KeyPairType.rsaPublicKey,
    );
    final signature = base64Url.decode(base64Url.normalize(parts[2]));
    final message = utf8.encode('${parts[0]}.${parts[1]}');

    final ok = await algorithm.verify(
      Uint8List.fromList(message),
      signature: Signature(Uint8List.fromList(signature)),
      key: publicKey,
    );
    if (!ok) {
      throw JwtVerificationException('signature invalide');
    }

    // Claims temporels.
    final currentMs = (now ?? DateTime.now()).millisecondsSinceEpoch;
    final exp = (payload['exp'] as num?)?.toInt();
    if (exp == null) {
      throw JwtVerificationException('claim "exp" manquant');
    }
    if (exp * 1000 < currentMs) {
      throw JwtVerificationException('JWT expiré');
    }
    final nbf = (payload['nbf'] as num?)?.toInt();
    if (nbf != null && nbf * 1000 > currentMs) {
      throw JwtVerificationException('JWT pas encore valide');
    }
    return JwtVerified(payload: payload, expiresAtMs: exp * 1000);
  }

  Map<String, dynamic> _decodeJson(String b64) {
    try {
      final raw = base64Url.decode(base64Url.normalize(b64));
      return jsonDecode(utf8.decode(raw)) as Map<String, dynamic>;
    } catch (e) {
      throw JwtVerificationException('JSON mal encodé : $e');
    }
  }

  /// Retire les en-têtes PEM pour ne garder que le buffer binaire
  /// de la clé publique (SubjectPublicKeyInfo DER).
  Uint8List _stripPemEnvelope(String pem) {
    final lines = pem
        .split('\n')
        .where((l) => !l.startsWith('-----') && l.trim().isNotEmpty)
        .toList();
    return base64Decode(lines.join());
  }
}
