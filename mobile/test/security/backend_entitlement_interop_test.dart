// Cross-runtime proof: actual Nest issuer -> Dart RSA/SPKI verifier.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/security/jwt_verifier.dart';

void main() {
  final path = Platform.environment['ENTITLEMENT_INTEROP_FIXTURE'];
  if (path == null) {
    test('backend entitlement fixture is required in CI', () {
      expect(Platform.environment['CI'], isNot('true'),
          reason: 'Generate the backend fixture before running Flutter tests.');
    }, skip: Platform.environment['CI'] != 'true'
        ? 'Set ENTITLEMENT_INTEROP_FIXTURE to run the cross-runtime tests.' : false);
    return;
  }
  final fixture = jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
  final verifier = JwtVerifier.fromPem(fixture['publicKey'] as String);
  test('verifies actual backend premium JWT and distinct subscription clock', () async {
    final premium = fixture['premium'] as Map<String, dynamic>;
    final verified = await verifier.verify(premium['jwt'] as String);
    expect(verified.payload['kind'], 'entitlement');
    expect(verified.payload['user_id'], 'interop-user');
    expect(verified.payload['device_id'], 'interop-device');
    expect(verified.payload['plan'], 'premium');
    expect(verified.payload['expires_at'], fixture['subscriptionExpiresAt']);
    expect(verified.expiresAtMs, lessThan(fixture['subscriptionExpiresAt'] as int));
    expect(verified.payload['allowed_decks'], ['*']);
  });
  test('verifies backend free JWT without inventing subscription days', () async {
    final free = fixture['free'] as Map<String, dynamic>;
    final verified = await verifier.verify(free['jwt'] as String);
    expect(verified.payload['plan'], 'free');
    expect(verified.payload['expires_at'], 0);
    expect(verified.payload['grace_until'], isNull);
    expect(verified.payload['allowed_decks'], isEmpty);
  });
  test('rejects a correctly signed but expired backend entitlement', () async {
    await expectLater(verifier.verify(fixture['expired'] as String),
        throwsA(isA<JwtVerificationException>()));
  });
  test('rejects tampering with backend subscription claims', () async {
    final parts = ((fixture['premium'] as Map<String, dynamic>)['jwt'] as String).split('.');
    final claims = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map<String, dynamic>;
    claims['user_id'] = 'another-user';
    parts[1] = base64Url.encode(utf8.encode(jsonEncode(claims))).replaceAll('=', '');
    await expectLater(verifier.verify(parts.join('.')), throwsA(isA<JwtVerificationException>()));
  });
}
