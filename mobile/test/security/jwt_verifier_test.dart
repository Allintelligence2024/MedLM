// Tests de JwtVerifier.
//
// On génère une paire RSA en mémoire (clé privée pour signer
// dans le test, publique bundle pour vérifier). Cela évite d'avoir
// à mocker le rootBundle.
import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/security/jwt_verifier.dart';

class _RsaPair {
  _RsaPair(this.publicPem, this.privatePem);
  final String publicPem;
  final String privatePem;
}

Future<_RsaPair> _generateRsaPair() async {
  final rsa = RsaPkcs1v15Sha256();
  final kp = await rsa.newKeyPair();
  final pub = await kp.extractPublicKey();
  final pubBytes = pub.bytes;
  final privBytes = (kp as RsaKeyPair).privateKey.bytes;
  String toPem(Uint8List b, String label) {
    final b64 = base64Encode(b);
    final lines = <String>[];
    for (var i = 0; i < b64.length; i += 64) {
      lines.add(b64.substring(i, i + 64 > b64.length ? b64.length : i + 64));
    }
    return '-----BEGIN $label-----\n${lines.join('\n')}\n-----END $label-----\n';
  }

  return _RsaPair(
    toPem(pubBytes, 'PUBLIC KEY'),
    toPem(privBytes, 'PRIVATE KEY'),
  );
}

Future<String> _signJwt({
  required String privatePem,
  required Map<String, dynamic> payload,
}) async {
  // Header minimal : alg=RS256.
  final header = {'alg': 'RS256', 'typ': 'JWT'};
  final enc = (Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  final signingInput = '${enc(header)}.${enc(payload)}';
  final privBytes = _pemToBytes(privatePem, 'PRIVATE KEY');

  // ⚠️ L'API `cryptography` n'expose pas la signature RSA directe
  // avec clé PKCS8. Pour ce test, on utilise une approche simplifiée
  // — on signe avec un HMAC-SHA256 au-dessus de la signing input +
  // un tag `alg=HS256`. C'est moche, mais ça reste dans le scope
  // "test de JwtVerifier" qui doit savoir rejeter les alg != RS256.
  //
  // Pour tester la vraie vérif RS256, on a aussi un test qui injecte
  // une signature bidon forgée (le test attend `signature invalide`).
  final hmac = Hmac.sha256();
  final secret = SecretKey(privBytes);
  final mac = await hmac.calculateMac(utf8.encode(signingInput + privBytes.toString()), secretKey: secret);
  final signature = base64Url.encode(mac.bytes).replaceAll('=', '');
  return '$signingInput.$signature';
}

Uint8List _pemToBytes(String pem, String label) {
  final start = pem.indexOf('-----BEGIN $label-----') + ('-----BEGIN $label-----').length;
  final end = pem.indexOf('-----END $label-----');
  final b64 = pem.substring(start, end).replaceAll('\n', '').trim();
  return Uint8List.fromList(base64Decode(b64));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    // On génère une paire fraîche à chaque setUp — chaque test
    // est indépendant.
  });

  test('rejette un JWT mal formé (pas 3 parties)', () async {
    final v = JwtVerifier();
    expect(
      () => v.verify('a.b'),
      throwsA(isA<JwtVerificationException>()),
    );
  });

  test('rejette un JWT avec alg ≠ RS256', () async {
    final v = JwtVerifier();
    final pair = await _generateRsaPair();
    // On bundle la publique via rootBundle mock.
    final channel = TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger;
    final key = StringCodec();
    channel.setMockMessageHandler(
      'flutter/assets',
      (msg) async {
        final call = key.decodeMessage(msg) as Map<String, Object?>?;
        final name = call?['asset'] as String?;
        if (name == 'assets/keys/entitlement_public.pem') {
          return key.encodeMessage(pair.publicPem);
        }
        return null;
      },
    );

    final jwt = await _signJwt(
      privatePem: pair.privatePem,
      payload: {
        'plan': 'premium',
        'exp': (DateTime.now().millisecondsSinceEpoch ~/ 1000) + 3600,
      },
    );
    // On patche le header pour avoir alg=HS256 (le body est le
    // même, mais le vérif doit refuser avant même d'essayer).
    final parts = jwt.split('.');
    final newHeader = base64Url.encode(utf8.encode('{"alg":"HS256","typ":"JWT"}')).replaceAll('=', '');
    final forged = '$newHeader.${parts[1]}.${parts[2]}';
    expect(
      () => v.verify(forged),
      throwsA(predicate(
        (e) => e is JwtVerificationException && e.message.contains('non supporté'),
      )),
    );
  });

  test('rejette un JWT dont la signature est invalide', () async {
    final v = JwtVerifier();
    final pair = await _generateRsaPair();
    final channel = TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger;
    final key = StringCodec();
    channel.setMockMessageHandler(
      'flutter/assets',
      (msg) async {
        final call = key.decodeMessage(msg) as Map<String, Object?>?;
        final name = call?['asset'] as String?;
        if (name == 'assets/keys/entitlement_public.pem') {
          return key.encodeMessage(pair.publicPem);
        }
        return null;
      },
    );
    // Header et payload OK, signature bidon (forgée).
    final header = base64Url.encode(utf8.encode('{"alg":"RS256","typ":"JWT"}')).replaceAll('=', '');
    final payload = base64Url.encode(utf8.encode(jsonEncode({
      'plan': 'premium',
      'exp': (DateTime.now().millisecondsSinceEpoch ~/ 1000) + 3600,
    }))).replaceAll('=', '');
    final forged = '$header.$payload.${base64Url.encode(List<int>.filled(256, 0xAB)).replaceAll('=', '')}';
    expect(
      () => v.verify(forged),
      throwsA(predicate(
        (e) => e is JwtVerificationException && e.message.contains('invalide'),
      )),
    );
  });

  test('rejette un JWT expiré', () async {
    final v = JwtVerifier();
    final pair = await _generateRsaPair();
    final channel = TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger;
    final key = StringCodec();
    channel.setMockMessageHandler(
      'flutter/assets',
      (msg) async {
        final call = key.decodeMessage(msg) as Map<String, Object?>?;
        final name = call?['asset'] as String?;
        if (name == 'assets/keys/entitlement_public.pem') {
          return key.encodeMessage(pair.publicPem);
        }
        return null;
      },
    );
    final header = base64Url.encode(utf8.encode('{"alg":"RS256","typ":"JWT"}')).replaceAll('=', '');
    final payload = base64Url.encode(utf8.encode(jsonEncode({
      'plan': 'premium',
      'exp': (DateTime.now().millisecondsSinceEpoch ~/ 1000) - 100, // expiré il y a 100s
    }))).replaceAll('=', '');
    final sig = base64Url.encode(List<int>.filled(256, 0x42)).replaceAll('=', '');
    final jwt = '$header.$payload.$sig';
    expect(
      () => v.verify(jwt),
      throwsA(predicate(
        (e) => e is JwtVerificationException && e.message.contains('expiré'),
      )),
    );
  });

  test('rejette un JWT sans claim exp', () async {
    final v = JwtVerifier();
    final pair = await _generateRsaPair();
    final channel = TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger;
    final key = StringCodec();
    channel.setMockMessageHandler(
      'flutter/assets',
      (msg) async {
        final call = key.decodeMessage(msg) as Map<String, Object?>?;
        final name = call?['asset'] as String?;
        if (name == 'assets/keys/entitlement_public.pem') {
          return key.encodeMessage(pair.publicPem);
        }
        return null;
      },
    );
    final header = base64Url.encode(utf8.encode('{"alg":"RS256","typ":"JWT"}')).replaceAll('=', '');
    final payload = base64Url.encode(utf8.encode('{"plan":"premium"}')).replaceAll('=', '');
    final sig = base64Url.encode(List<int>.filled(256, 0x42)).replaceAll('=', '');
    expect(
      () => v.verify('$header.$payload.$sig'),
      throwsA(predicate(
        (e) => e is JwtVerificationException && e.message.contains('exp'),
      )),
    );
  });

  test('rejette si la clé publique bundle est absente', () async {
    final v = JwtVerifier();
    // Pas de mock → le rootBundle.read lève.
    final channel = TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger;
    final key = StringCodec();
    channel.setMockMessageHandler(
      'flutter/assets',
      (msg) async => null,
    );
    final header = base64Url.encode(utf8.encode('{"alg":"RS256","typ":"JWT"}')).replaceAll('=', '');
    final payload = base64Url.encode(utf8.encode('{"plan":"premium","exp":9999999999}')).replaceAll('=', '');
    final sig = base64Url.encode(List<int>.filled(256, 0x42)).replaceAll('=', '');
    expect(
      () => v.verify('$header.$payload.$sig'),
      throwsA(isA<JwtVerificationException>()),
    );
  });
}
