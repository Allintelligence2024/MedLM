// Tests de AesGcmCipher.
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/security/aes_gcm.dart';

void main() {
  late AesGcmCipher cipher;
  late Uint8List key;

  setUp(() {
    cipher = AesGcmCipher();
    key = Uint8List.fromList(List<int>.generate(32, (i) => i + 1));
  });

  test('chiffre puis déchiffre → plaintext identique', () async {
    final plain = Uint8List.fromList('bonjour le monde'.codeUnits);
    final bundle = await cipher.encrypt(
      key: key,
      plaintext: plain,
      keyId: 'v1',
    );
    expect(bundle.iv.length, 12);
    expect(bundle.tag.length, 16);
    expect(bundle.ciphertext, isNot(equals(plain)));

    final back = await cipher.decrypt(key: key, bundle: bundle);
    expect(back, equals(plain));
  });

  test('refuse une clé qui ne fait pas 32 octets', () async {
    final shortKey = Uint8List.fromList(List<int>.generate(16, (i) => i));
    expect(
      () => cipher.encrypt(
        key: shortKey,
        plaintext: Uint8List(0),
        keyId: 'v1',
      ),
      throwsArgumentError,
    );
  });

  test('déchiffrement échoue avec une mauvaise clé', () async {
    final plain = Uint8List.fromList('secret'.codeUnits);
    final bundle = await cipher.encrypt(
      key: key,
      plaintext: plain,
      keyId: 'v1',
    );
    final wrongKey = Uint8List.fromList(List<int>.generate(32, (i) => 99));
    expect(
      () => cipher.decrypt(key: wrongKey, bundle: bundle),
      throwsA(anything),
    );
  });

  test('déchiffrement échoue si on altère le ciphertext', () async {
    final plain = Uint8List.fromList('secret médical'.codeUnits);
    final bundle = await cipher.encrypt(
      key: key,
      plaintext: plain,
      keyId: 'v1',
    );
    // Altère un octet du ciphertext.
    bundle.ciphertext[0] ^= 0x01;
    expect(
      () => cipher.decrypt(key: key, bundle: bundle),
      throwsA(anything),
    );
  });

  test('sérialisation/désérialisation via toBytes/fromBytes', () async {
    final plain = Uint8List.fromList('deck de 500 cartes'.codeUnits);
    final bundle = await cipher.encrypt(
      key: key,
      plaintext: plain,
      keyId: 'v2',
    );
    final bytes = bundle.toBytes();
    final restored = EncryptedDeck.fromBytes(bytes: bytes, keyId: 'v2');
    expect(restored.iv, equals(bundle.iv));
    expect(restored.tag, equals(bundle.tag));
    expect(restored.ciphertext, equals(bundle.ciphertext));
    expect(restored.keyId, equals('v2'));
    final back = await cipher.decrypt(key: key, bundle: restored);
    expect(back, equals(plain));
  });

  test('JSON helper round-trip', () async {
    final json = {
      'cards': [
        {'id': 'c1', 'fr': 'coeur', 'en': 'heart'},
        {'id': 'c2', 'fr': 'poumon', 'en': 'lung'},
      ],
    };
    final bundle = await cipher.encryptJson(key: key, json: json, keyId: 'v1');
    final back = await cipher.decryptJson(key: key, bundle: bundle);
    expect(back, equals(json));
  });

  test('chiffrements successifs produisent des IV différents', () async {
    final plain = Uint8List.fromList('même plaintext'.codeUnits);
    final a = await cipher.encrypt(key: key, plaintext: plain, keyId: 'v1');
    final b = await cipher.encrypt(key: key, plaintext: plain, keyId: 'v1');
    expect(a.iv, isNot(equals(b.iv)));
    expect(a.ciphertext, isNot(equals(b.ciphertext)));
  });
}
