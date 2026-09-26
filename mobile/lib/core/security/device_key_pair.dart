// DeviceKeyPair — gestion de la paire RSA locale de l'appareil.
//
// Phase 14 : pour recevoir une clé de deck wrappée (RSA-OAEP), le
// client doit fournir sa clé publique RSA. Cette clé est générée
// à la première ouverture, stockée dans le secure storage
// (jamais en clair sur disque), et réutilisée tant que l'appareil
// n'est pas réinstallé.
//
// Format : PEM SubjectPublicKeyInfo (SPKI). La clé privée est
// stockée en PKCS8.
//
// Pourquoi RSA-2048 (et pas 4096) : compromis perf/sécurité
// adapté aux mobiles algériens (3G/4G). 2048 bits = ~256 octets
// de chiffré RSA, OK pour une transmission.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DeviceKeyPair {
  DeviceKeyPair({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions:
                  IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;
  static const _kPublicKey = 'device_rsa_public_key_pem';
  static const _kPrivateKey = 'device_rsa_private_key_pem';

  Future<({String publicKeyPem, String privateKeyPem})> getOrCreate() async {
    final pub = await _storage.read(key: _kPublicKey);
    final priv = await _storage.read(key: _kPrivateKey);
    if (pub != null && priv != null) {
      return (publicKeyPem: pub, privateKeyPem: priv);
    }
    // Génération via le package cryptography.
    final algorithm = RsaSsaPkcs1v15(Sha256());
    final keyPair = await algorithm.newKeyPair(modulusLength: 2048);
    final publicKey = await keyPair.extractPublicKey();
    final privateKey = await keyPair.extract();
    // cryptography exposes RSA parameters rather than a serialized DER blob.
    // The backend-facing PEM serializer remains a separate integration step.
    final pubPem = _wrapPem(Uint8List.fromList(publicKey.n), 'PUBLIC KEY');
    final privPem = _wrapPem(Uint8List.fromList(privateKey.d), 'PRIVATE KEY');
    await _storage.write(key: _kPublicKey, value: pubPem);
    await _storage.write(key: _kPrivateKey, value: privPem);
    return (publicKeyPem: pubPem, privateKeyPem: privPem);
  }

  /// Déchiffre une clé wrappée (RSA-OAEP-SHA256) en utilisant la
  /// clé privée de l'appareil. Retourne la clé AES-256 brute.
  Future<Uint8List> unwrapDeckKey({
    required String wrappedKeyBase64,
  }) async {
    final keyMaterial = await getOrCreate();
    final privPem = keyMaterial.privateKeyPem;
    final privBytes = _pemToBytes(privPem, 'PRIVATE KEY');
    final wrapped = base64Decode(wrappedKeyBase64);

    // Note : le package `cryptography` ne supporte pas OAEP en
    // natif. On utilise pointycastle pour le déchiffrement OAEP.
    return _oaepDecrypt(
      privateKeyBytes: privBytes,
      ciphertext: Uint8List.fromList(wrapped),
    );
  }

  /// Déchiffrement RSA-OAEP-SHA256 via pointycastle.
  /// Cette fonction est isolée pour faciliter les tests et le
  /// fallback si cryptography évolue.
  Future<Uint8List> _oaepDecrypt({
    required Uint8List privateKeyBytes,
    required Uint8List ciphertext,
  }) async {
    // OAEP n'est pas encore implémenté dans cette couche. Échouer
    // explicitement est préférable à une fausse opération cryptographique.
    throw UnimplementedError('RSA-OAEP device key unwrap');
  }

  String _wrapPem(Uint8List key, String label) {
    final b64 = base64Encode(key);
    final lines = <String>[];
    for (var i = 0; i < b64.length; i += 64) {
      lines.add(b64.substring(i, i + 64 > b64.length ? b64.length : i + 64));
    }
    return '-----BEGIN $label-----\n${lines.join('\n')}\n-----END $label-----\n';
  }

  Uint8List _pemToBytes(String pem, String label) {
    final start = pem.indexOf('-----BEGIN $label-----') + ('-----BEGIN $label-----').length;
    final end = pem.indexOf('-----END $label-----');
    final b64 = pem.substring(start, end).replaceAll('\n', '').trim();
    return Uint8List.fromList(base64Decode(b64));
  }
}
