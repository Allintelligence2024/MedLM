// JwtVerifier — vérifie cryptographiquement la signature RS256 d'un
// JWT d'entitlement à l'aide de la clé publique embarquée.
//
// v2 §8.1 : « vérifiable offline via clé publique ». Sans cette
// vérification, un attaquant ayant accès au secure storage pourrait
// forger un JWT `plan: premium` et contourner le paywall.
//
// Implémentation :
//   * On décode le header pour lire `alg` (refus si != RS256) et le
//     payload SANS le vérifier (juste pour la forme).
//   * On recompose `signingInput = base64url(header) + "." + base64url(payload)`.
//   * On vérifie la signature avec la clé publique RSA et SHA-256
//     (PKCS#1 v1.5).
//   * Si la signature est OK, on vérifie les claims temporels
//     (`exp`, `nbf`).
//
// Format de clé : le fichier embarqué est un PEM **SubjectPublicKeyInfo**
// (RFC 5280, « -----BEGIN PUBLIC KEY----- »), celui que produit
// `backend/scripts/generate_entitlement_keys.mjs`. Il est analysé ici
// en DER minimal (voir [_parseSpki]) : le modulus et l'exposant sont
// extraits du DER, le modulus n'est PAS le DER complet. Confondre les
// deux (bug corrigé le 2026-09-26) faisait échouer la vérification de
// TOUS les JWT réels — la fonctionnalité était donc morte, en
// « fail-closed ».
//
// La clé est chargée par [pemLoader] (par défaut `rootBundle`), ce qui
// rend la vérification testable sans canal de plateforme.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/services.dart' show rootBundle;

/// Signature d'un fournisseur de PEM (bundle d'assets, fichier, mémoire).
typedef PemLoader = Future<String> Function(String assetPath);

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
  JwtVerifier({
    this.publicKeyAssetPath = 'assets/keys/entitlement_public.pem',
    PemLoader? pemLoader,
  }) : _pemLoader = pemLoader ?? rootBundle.loadString;

  /// Vérificateur monté sur une clé PEM déjà en mémoire (tests,
  /// rotation de clé poussée par le serveur).
  JwtVerifier.fromPem(String pem)
      : publicKeyAssetPath = '<mémoire>',
        _pemLoader = _unusedLoader,
        _cachedPem = pem.trim();

  final String publicKeyAssetPath;
  final PemLoader _pemLoader;

  String? _cachedPem;

  static Future<String> _unusedLoader(String assetPath) async =>
      throw StateError('Aucun loader : PEM fourni directement.');

  /// Charge et analyse la clé publique. Lève
  /// [JwtVerificationException] si l'asset est absent ou illisible —
  /// on refuse alors TOUTE vérification (fail-closed, v2 §8.1).
  Future<RsaPublicKey> publicKey() async {
    final pem = _cachedPem ?? await _loadPem();
    final der = _pemToDer(pem);
    final parts = _parseSpki(der);
    return RsaPublicKey(n: parts.modulus, e: parts.exponent);
  }

  Future<String> _loadPem() async {
    try {
      _cachedPem = (await _pemLoader(publicKeyAssetPath)).trim();
    } catch (_) {
      // Pas de clé bundle (asset supprimé, build cassé, canal
      // indisponible) : on refuse systématiquement la vérification.
      throw JwtVerificationException(
        'clé publique manquante — vérification impossible',
      );
    }
    return _cachedPem!;
  }

  /// Vérifie la signature RS256 et la validité temporelle du JWT.
  /// Lève [JwtVerificationException] en cas d'échec.
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
    final publicKey = await this.publicKey();
    final algorithm = RsaSsaPkcs1v15(Sha256());
    final signature = base64Url.decode(base64Url.normalize(parts[2]));
    final message = utf8.encode('${parts[0]}.${parts[1]}');

    final ok = await algorithm.verify(
      message,
      signature: Signature(
        signature,
        publicKey: publicKey,
      ),
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

  /// Retire l'en-tête/pied PEM et décode le base64 : on obtient le DER.
  Uint8List _pemToDer(String pem) {
    final body = pem
        .split('\n')
        .where((l) => !l.startsWith('-----') && l.trim().isNotEmpty)
        .join()
        .trim();
    try {
      final der = base64Decode(body);
      return Uint8List.fromList(der);
    } catch (_) {
      throw JwtVerificationException('clé publique illisible (base64)');
    }
  }
}

/// (modulus, exposant) d'une clé RSA, en big-endian non signé.
class RsaKeyParts {
  const RsaKeyParts(this.modulus, this.exponent);
  final Uint8List modulus;
  final Uint8List exponent;
}

/// OID `rsaEncryption` (1.2.840.113549.1.1.1) en DER.
const List<int> _oidRsaEncryption = <int>[
  0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
];

/// Analyse un SubjectPublicKeyInfo RSA :
///
/// ```text
/// SEQUENCE {
///   SEQUENCE { OID rsaEncryption, NULL }     -- AlgorithmIdentifier
///   BIT STRING { SEQUENCE { INTEGER n, INTEGER e } }
/// }
/// ```
RsaKeyParts _parseSpki(Uint8List der) {
  final outer = _readTlv(der, 0, 'SEQUENCE');
  if (outer.tag != 0x30) {
    throw JwtVerificationException(
      'clé publique illisible : ce n\'est pas un SubjectPublicKeyInfo '
      '(format attendu : -----BEGIN PUBLIC KEY-----)',
    );
  }

  final algId = _readTlv(der, outer.contentStart, 'AlgorithmIdentifier');
  if (algId.tag != 0x30) {
    throw JwtVerificationException('clé publique illisible : AlgorithmIdentifier');
  }
  final oid = _readTlv(der, algId.contentStart, 'OID');
  if (oid.tag != 0x06 || !_bytesEqual(der, oid, _oidRsaEncryption)) {
    throw JwtVerificationException(
      'clé publique non RSA (algorithme non supporté)',
    );
  }

  final bitString = _readTlv(der, algId.contentStart + algId.length, 'BIT STRING');
  if (bitString.tag != 0x03 || bitString.length < 2) {
    throw JwtVerificationException('clé publique illisible : BIT STRING');
  }
  if (der[bitString.contentStart] != 0) {
    throw JwtVerificationException('clé publique illisible : bits non utilisés');
  }

  final keySeq = _readTlv(der, bitString.contentStart + 1, 'RSAPublicKey');
  if (keySeq.tag != 0x30) {
    throw JwtVerificationException('clé publique illisible : RSAPublicKey');
  }
  final n = _readTlv(der, keySeq.contentStart, 'modulus');
  final e = _readTlv(der, n.contentStart + n.length, 'exponent');
  if (n.tag != 0x02 || e.tag != 0x02) {
    throw JwtVerificationException('clé publique illisible : INTEGER attendu');
  }

  final modulus = _unsigned(der, n);
  final exponent = _unsigned(der, e);
  // Garde-fous : RSA-1024 minimum, exposant > 1. Une clé plus faible
  // (ou un PEM tronqué) est refusée plutôt que « vérifiée ».
  if (modulus.length < 128) {
    throw JwtVerificationException(
      'clé publique trop faible (${modulus.length * 8} bits < 1024)',
    );
  }
  // L'exposant doit être impair et > 1 (3, 17, 65537…). On le teste sur
  // sa valeur, pas sur son dernier octet : 65537 = 01 00 01.
  if (exponent.isEmpty ||
      exponent.length > 8 ||
      exponent.last.isEven ||
      (exponent.length == 1 && exponent.first < 3)) {
    throw JwtVerificationException('clé publique illisible : exposant invalide');
  }
  return RsaKeyParts(modulus, exponent);
}

/// Retire le zéro de bourrage d'un INTEGER DER (big-endian signé).
Uint8List _unsigned(Uint8List der, _Tlv integer) {
  var start = integer.contentStart;
  final end = integer.contentStart + integer.length;
  while (end - start > 1 && der[start] == 0) {
    start++;
  }
  return Uint8List.sublistView(der, start, end);
}

bool _bytesEqual(Uint8List der, _Tlv tlv, List<int> expected) {
  if (tlv.length != expected.length) return false;
  for (var i = 0; i < expected.length; i++) {
    if (der[tlv.contentStart + i] != expected[i]) return false;
  }
  return true;
}

class _Tlv {
  const _Tlv(this.tag, this.contentStart, this.length);
  final int tag;
  final int contentStart;
  final int length;
}

/// Lecteur TLV minimal (un seul niveau) : suffisant pour un DER de clé
/// publique RSA, et volontairement sans dépendance ASN.1 externe.
_Tlv _readTlv(Uint8List der, int offset, String what) {
  if (offset + 2 > der.length) {
    throw JwtVerificationException('clé publique illisible : $what tronqué');
  }
  final tag = der[offset];
  var cursor = offset + 1;
  var length = der[cursor++];
  if (length & 0x80 != 0) {
    final byteCount = length & 0x7f;
    if (byteCount == 0 || byteCount > 4 || cursor + byteCount > der.length) {
      throw JwtVerificationException('clé publique illisible : $what (longueur)');
    }
    length = 0;
    for (var i = 0; i < byteCount; i++) {
      length = (length << 8) | der[cursor++];
    }
  }
  if (cursor + length > der.length) {
    throw JwtVerificationException('clé publique illisible : $what incomplet');
  }
  return _Tlv(tag, cursor, length);
}
