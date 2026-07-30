// AesGcmCipher — chiffrement / déchiffrement symétrique AES-256-GCM
// pour les decks premium téléchargés en mode hors-ligne (v2 §8.1
// « Revocation : next sync → new key or wipe si grace expired »).
//
// Modèle de clés :
//   * Une `deckKey` (32 octets aléatoires) est générée côté serveur
//     et livrée chiffrée (RSA-OAEP) avec le deck.
//   * Le client stocke la `deckKey` dans flutter_secure_storage
//     (Keystore / Keychain), jamais sur disque en clair.
//   * Le bundle chiffré contient (header): {alg, iv, tag, keyId}.
//
// Format on-disk du deck chiffré :
//   [12 octets IV][16 octets tag][ciphertext...]
// où la concaténation (IV || tag) sert à la fois de nonce et de MAC.
//
// Implémentation : package `cryptography` (AES-GCM, Dart pur).
library;

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

class EncryptedDeck {
  EncryptedDeck({
    required this.iv,
    required this.tag,
    required this.ciphertext,
    required this.keyId,
  });

  final Uint8List iv;
  final Uint8List tag;
  final Uint8List ciphertext;
  final String keyId;

  /// Sérialise pour stockage (IV + tag + ciphertext).
  Uint8List toBytes() {
    final out = BytesBuilder()
      ..add(iv)
      ..add(tag)
      ..add(ciphertext);
    return out.toBytes();
  }

  static EncryptedDeck fromBytes({
    required Uint8List bytes,
    required String keyId,
  }) {
    if (bytes.length < 12 + 16) {
      throw const FormatException('bundle chiffré trop court');
    }
    return EncryptedDeck(
      iv: Uint8List.fromList(bytes.sublist(0, 12)),
      tag: Uint8List.fromList(bytes.sublist(12, 28)),
      ciphertext: Uint8List.fromList(bytes.sublist(28)),
      keyId: keyId,
    );
  }
}

class AesGcmCipher {
  AesGcmCipher();

  final _algorithm = AesGcm.with256bits();

  /// Chiffre `plaintext` avec la clé `key` et un IV frais.
  Future<EncryptedDeck> encrypt({
    required Uint8List key,
    required Uint8List plaintext,
    required String keyId,
    Uint8List? iv,
  }) async {
    if (key.length != 32) {
      throw ArgumentError('la clé doit faire 32 octets (AES-256)');
    }
    final ivBytes = iv ?? _randomBytes(12);
    final secretKey = SecretKey(key);
    final box = await _algorithm.encrypt(
      plaintext,
      secretKey: secretKey,
      nonce: ivBytes,
    );
    return EncryptedDeck(
      iv: ivBytes,
      tag: Uint8List.fromList(box.mac.bytes),
      ciphertext: Uint8List.fromList(box.cipherText),
      keyId: keyId,
    );
  }

  /// Déchiffre un bundle. Échoue (tag mismatch) si la clé est
  /// incorrecte ou si le bundle a été altéré.
  Future<Uint8List> decrypt({
    required Uint8List key,
    required EncryptedDeck bundle,
  }) async {
    if (key.length != 32) {
      throw ArgumentError('la clé doit faire 32 octets (AES-256)');
    }
    final secretKey = SecretKey(key);
    final clear = await _algorithm.decrypt(
      SecretBox(
        bundle.ciphertext,
        nonce: bundle.iv,
        mac: Mac(bundle.tag),
      ),
      secretKey: secretKey,
    );
    return Uint8List.fromList(clear);
  }

  /// Déchiffre un bundle sérialisé.
  Future<Uint8List> decryptBytes({
    required Uint8List key,
    required Uint8List bytes,
    required String keyId,
  }) async {
    final bundle = EncryptedDeck.fromBytes(bytes: bytes, keyId: keyId);
    return decrypt(key: key, bundle: bundle);
  }

  /// Helper : chiffre du JSON (cartes, méta de deck).
  Future<EncryptedDeck> encryptJson({
    required Uint8List key,
    required Map<String, dynamic> json,
    required String keyId,
  }) async {
    final bytes = Uint8List.fromList(utf8.encode(jsonEncode(json)));
    return encrypt(key: key, plaintext: bytes, keyId: keyId);
  }

  Future<Map<String, dynamic>> decryptJson({
    required Uint8List key,
    required EncryptedDeck bundle,
  }) async {
    final clear = await decrypt(key: key, bundle: bundle);
    return jsonDecode(utf8.decode(clear)) as Map<String, dynamic>;
  }

  final _random = Random.secure();
  Uint8List _randomBytes(int n) {
    final out = Uint8List(n);
    for (var i = 0; i < n; i++) {
      out[i] = _random.nextInt(256);
    }
    return out;
  }
}
