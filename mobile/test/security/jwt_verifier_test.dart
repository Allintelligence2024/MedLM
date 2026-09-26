// Tests de JwtVerifier — vraie cryptographie RS256.
//
// Historique : ces tests mockaient le canal `flutter/assets` et
// signaient en HMAC, ce qui (a) levait `UnimplementedError` sur les
// versions récentes de Flutter et (b) ne prouvait rien : aucune clé
// RSA réelle n'était utilisée, et le « PEM » produit contenait le
// modulus brut, format que le vérificateur ne sait pas lire en
// production (clé SPKI du bundle). Les tests ci-dessous signent de
// vrais JWT RS256 (PKCS#1 v1.5 + SHA-256) avec `pointycastle`, en
// exposant la clé publique au format EXACT du bundle
// (`-----BEGIN PUBLIC KEY-----`, SubjectPublicKeyInfo), et injectent
// cette clé via `JwtVerifier.fromPem` : aucun canal de plateforme,
// aucune dépendance au rootBundle.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/security/jwt_verifier.dart';
import 'package:pointycastle/export.dart';

// ── Génération de clé + signature RS256 (pointycastle) ──────────────

class _RsaFixture {
  _RsaFixture(this.keyPair);

  final AsymmetricKeyPair<PublicKey, PrivateKey> keyPair;

  RSAPublicKey get publicKey => keyPair.publicKey as RSAPublicKey;
  RSAPrivateKey get privateKey => keyPair.privateKey as RSAPrivateKey;

  /// PEM SubjectPublicKeyInfo — même format que l'asset embarqué.
  String get publicPem => encodeSpkiPem(publicKey);
}

_RsaFixture _newKeyPair() {
  // Graine fixe : la génération est reproductible, les tests ne
  // dépendent pas d'une source d'entropie système.
  final seed = Uint8List.fromList(List<int>.generate(32, (i) => i + 7));
  final random = FortunaRandom()..seed(KeyParameter(seed));
  final generator = RSAKeyGenerator()
    ..init(ParametersWithRandom(
        RSAKeyGeneratorParameters(BigInt.from(65537), 2048, 64),
      random,
    ));
  return _RsaFixture(generator.generateKeyPair());
}

/// Encode une clé publique RSA en PEM SubjectPublicKeyInfo (DER).
String encodeSpkiPem(RSAPublicKey key) {
  final rsaKey = _tlv(0x30, <int>[
    ..._integerDer(key.modulus!),
    ..._integerDer(key.exponent!),
  ]);
  final algorithmIdentifier = _tlv(0x30, <int>[
    0x06, 0x09, // OID
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption
    0x05, 0x00, // NULL
  ]);
  final spki = _tlv(0x30, <int>[
    ...algorithmIdentifier,
    0x03, // BIT STRING
    ..._lengthDer(rsaKey.length + 1),
    0x00, // 0 bit inutilisé
    ...rsaKey,
  ]);
  final b64 = base64Encode(spki);
  final lines = <String>[];
  for (var i = 0; i < b64.length; i += 64) {
    lines.add(b64.substring(i, i + 64 > b64.length ? b64.length : i + 64));
  }
  return '-----BEGIN PUBLIC KEY-----\n'
      '${lines.join('\n')}\n'
      '-----END PUBLIC KEY-----\n';
}

Uint8List _tlv(int tag, List<int> content) =>
    Uint8List.fromList(<int>[tag, ..._lengthDer(content.length), ...content]);

List<int> _lengthDer(int length) {
  if (length < 0x80) return <int>[length];
  final bytes = <int>[];
  var value = length;
  while (value > 0) {
    bytes.insert(0, value & 0xff);
    value >>= 8;
  }
  return <int>[0x80 | bytes.length, ...bytes];
}

/// Encodage big-endian non signé d'un BigInt (`BigInt.toBytes` n'existe
/// pas dans dart:core).
Uint8List _unsignedBytes(BigInt value) {
  var hex = value.toRadixString(16);
  if (hex.length.isOdd) hex = '0$hex';
  final bytes = Uint8List(hex.length ~/ 2);
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16);
  }
  return bytes;
}

/// INTEGER DER non signé (avec zéro de bourrage si le bit de poids fort
/// est à 1 — c'est le cas de tous les modulus RSA réels).
List<int> _integerDer(BigInt value) {
  var bytes = _unsignedBytes(value);
  if (bytes.isNotEmpty && bytes[0] & 0x80 != 0) {
    bytes = Uint8List.fromList(<int>[0x00, ...bytes]);
  }
  return _tlv(0x02, bytes);
}

/// En-tête produit par le backend (`alg=RS256`).
const Map<String, dynamic> _rs256Header = <String, dynamic>{
  'alg': 'RS256',
  'typ': 'JWT',
};

String _b64Url(Map<String, dynamic> json) =>
    base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');

/// Signe un JWT RS256 réel (PKCS#1 v1.5 + SHA-256).
String _signJwt(
  _RsaFixture fixture, {
  Map<String, dynamic>? header,
  required Map<String, dynamic> payload,
}) {
  final signingInput = '${_b64Url(header ?? _rs256Header)}.${_b64Url(payload)}';
  final signer = RSASigner(SHA256Digest(), '0609608648016503040201')
    ..init(true, PrivateKeyParameter<RSAPrivateKey>(fixture.privateKey));
  final signature = signer.generateSignature(utf8.encode(signingInput)).bytes;
  return '$signingInput.${base64Url.encode(signature).replaceAll('=', '')}';
}

int _epochSeconds({int offsetSeconds = 3600}) =>
    (DateTime.now().millisecondsSinceEpoch ~/ 1000) + offsetSeconds;

void main() {
  late _RsaFixture fixture;
  late JwtVerifier verifier;


  setUpAll(() {
    fixture = _newKeyPair();
    verifier = JwtVerifier.fromPem(fixture.publicPem);
  });

  test('accepte un JWT RS256 réellement signé et expose les claims', () async {
    final jwt = _signJwt(
      fixture,
      payload: <String, dynamic>{
        'plan': 'premium',
        'sub': 'user-1',
        'exp': _epochSeconds(),
      },
    );

    final verified = await verifier.verify(jwt);
    expect(verified.payload['plan'], 'premium');
    expect(verified.payload['sub'], 'user-1');
    expect(verified.expiresAtMs, (verified.payload['exp'] as int) * 1000,
        reason: 'exp (secondes) doit être exposé en millisecondes');
  });

  test('rejette un JWT dont un octet du payload a été modifié', () async {
    final jwt = _signJwt(
      fixture,
      payload: <String, dynamic>{'plan': 'free', 'exp': _epochSeconds()},
    );
    final parts = jwt.split('.');
    // Payload réécrit en `premium` : la signature ne couvre plus le
    // contenu (attaque « paywall bypass » de la v2 §8.1).
    final forgedPayload = _b64Url(<String, dynamic>{
      'plan': 'premium',
      'exp': _epochSeconds(),
    });
    final forged = '${parts[0]}.$forgedPayload.${parts[2]}';

    await expectLater(
      verifier.verify(forged),
      throwsA(predicate((e) =>
          e is JwtVerificationException && e.message.contains('invalide'))),
    );
  });

  test('rejette un JWT signé par une autre clé', () async {
    final autre = _newKeyPair();
    final jwt = _signJwt(
      autre,
      payload: <String, dynamic>{'plan': 'premium', 'exp': _epochSeconds()},
    );

    await expectLater(
      verifier.verify(jwt),
      throwsA(predicate((e) =>
          e is JwtVerificationException && e.message.contains('invalide'))),
    );
  });

  test('rejette un JWT mal formé (pas 3 parties)', () async {
    await expectLater(
      verifier.verify('a.b'),
      throwsA(isA<JwtVerificationException>()),
    );
  });

  test('rejette un JWT avec alg ≠ RS256 (confusion d\'algorithme)', () async {
    // En-tête HS256 : le vérificateur doit refuser AVANT de toucher à
    // la clé (aucune signature HMAC ne doit être acceptée).
    final jwt = _signJwt(
      fixture,
      header: <String, dynamic>{'alg': 'HS256', 'typ': 'JWT'},
      payload: <String, dynamic>{'plan': 'premium', 'exp': _epochSeconds()},
    );

    await expectLater(
      verifier.verify(jwt),
      throwsA(predicate((e) =>
          e is JwtVerificationException && e.message.contains('non supporté'))),
    );
  });

  test('rejette un JWT expiré (signature pourtant valide)', () async {
    final jwt = _signJwt(
      fixture,
      payload: <String, dynamic>{
        'plan': 'premium',
        'exp': _epochSeconds(offsetSeconds: -100),
      },
    );

    await expectLater(
      verifier.verify(jwt),
      throwsA(predicate(
          (e) => e is JwtVerificationException && e.message.contains('expiré'))),
    );
  });

  test('rejette un JWT sans claim exp (signature pourtant valide)', () async {
    final jwt = _signJwt(
      fixture,
      payload: <String, dynamic>{'plan': 'premium'},
    );

    await expectLater(
      verifier.verify(jwt),
      throwsA(predicate((e) =>
          e is JwtVerificationException && e.message.contains('exp'))),
    );
  });

  test('rejette un JWT pas encore valide (nbf futur)', () async {
    final jwt = _signJwt(
      fixture,
      payload: <String, dynamic>{
        'plan': 'premium',
        'exp': _epochSeconds(),
        'nbf': _epochSeconds(offsetSeconds: 600),
      },
    );

    await expectLater(
      verifier.verify(jwt),
      throwsA(predicate((e) =>
          e is JwtVerificationException && e.message.contains('valide'))),
    );
  });

  test('rejette un JWT expiré même avec une signature valide et une '
      'horloge injectée', () async {
    final jwt = _signJwt(
      fixture,
      payload: <String, dynamic>{
        'plan': 'premium',
        'exp': _epochSeconds(offsetSeconds: 60),
      },
    );
    // `now` injecté 2 h plus tard : le contrat temporel doit être
    // testable sans attendre.
    final later = DateTime.now().add(const Duration(hours: 2));
    await expectLater(
      verifier.verify(jwt, now: later),
      throwsA(predicate(
          (e) => e is JwtVerificationException && e.message.contains('expiré'))),
    );
  });

  group('clé publique', () {
    test('le PEM produit est analysé (SPKI → modulus + exposant)', () async {
      final key = await verifier.publicKey();
      expect(key.n.length, 256, reason: 'RSA-2048 → modulus de 2048 bits');
    });

    test('l\'asset embarqué se parse (RSA-2048, exposant 65537)', () async {
      // La clé réellement livrée dans l'app : si son format changeait
      // (DER, corps brut, PKCS#1…), ce test le dirait — c'était
      // précisément le trou : le vérificateur lisait le DER SPKI comme
      // s'il s'agissait du modulus, donc AUCUN JWT du backend n'était
      // vérifiable.
      final pem = File('assets/keys/entitlement_public.pem').readAsStringSync();
      expect(pem, contains('BEGIN PUBLIC KEY'));
      final bundled = JwtVerifier.fromPem(pem);
      final key = await bundled.publicKey();
      expect(key.n.length, 256);
    });

    test('asset absent → refus explicite (fail-closed)', () async {
      final absent = JwtVerifier(
        pemLoader: (_) async => throw StateError('asset introuvable'),
      );
      final jwt = _signJwt(
        fixture,
        payload: <String, dynamic>{'plan': 'premium', 'exp': _epochSeconds()},
      );
      await expectLater(
        absent.verify(jwt),
        throwsA(predicate((e) =>
            e is JwtVerificationException &&
            e.message.contains('clé publique manquante'))),
      );
    });

    test('PEM illisible → refus explicite', () async {
      final corrompu = JwtVerifier.fromPem('-----BEGIN PUBLIC KEY-----\n'
          'ceci-n-est-pas-du-base64!!\n'
          '-----END PUBLIC KEY-----');
      final jwt = _signJwt(
        fixture,
        payload: <String, dynamic>{'plan': 'premium', 'exp': _epochSeconds()},
      );
      await expectLater(
        corrompu.verify(jwt),
        throwsA(isA<JwtVerificationException>()),
      );
    });

    test('clé non RSA (corps sans OID rsaEncryption) → refus explicite',
        () async {
      final pasRsa = JwtVerifier.fromPem('-----BEGIN PUBLIC KEY-----\n'
          '${base64Encode(<int>[0x30, 0x03, 0x02, 0x01, 0x01])}\n'
          '-----END PUBLIC KEY-----');
      final jwt = _signJwt(
        fixture,
        payload: <String, dynamic>{'plan': 'premium', 'exp': _epochSeconds()},
      );
      await expectLater(
        pasRsa.verify(jwt),
        throwsA(isA<JwtVerificationException>()),
      );
    });
  });
}
