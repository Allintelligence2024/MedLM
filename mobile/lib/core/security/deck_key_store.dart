// DeckKeyStore — persistance des clés de déchiffrement des decks
// premium dans le Keystore / Keychain (jamais en clair sur disque).
//
// Cycle de vie (v2 §8.1) :
//   1. Le serveur livre le deck chiffré + la clé, elle-même
//      chiffrée en RSA-OAEP avec la clé publique de l'appareil.
//   2. Le client déchiffre la clé avec sa clé privée RSA locale
//      (générée à la première utilisation, stockée dans le
//      secure storage via flutter_secure_storage).
//   3. La clé AES-256 est stockée dans le secure storage avec un
//      préfixe `deck_key:<deckId>`.
//   4. Si l'entitlement devient `grace expired` à la prochaine
//      sync, on supprime toutes les clés (wipe).
//
// Note : pour cette première implémentation, on stocke la clé
// directement (déjà déchiffrée) dans le secure storage. Le
// chiffrement RSA-OAEP de la clé côté serveur viendra avec la
// Phase 14 (échange de clés).
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DeckKeyStore {
  DeckKeyStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions:
                  IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;
  static const _prefix = 'deck_key:';

  Future<void> saveKey(String deckId, Uint8List key) async {
    if (key.length != 32) {
      throw ArgumentError('clé de deck invalide (${key.length} octets)');
    }
    await _storage.write(key: '$_prefix$deckId', value: base64Encode(key));
  }

  Future<Uint8List?> readKey(String deckId) async {
    final v = await _storage.read(key: '$_prefix$deckId');
    if (v == null) return null;
    return Uint8List.fromList(base64Decode(v));
  }

  Future<void> deleteKey(String deckId) async {
    await _storage.delete(key: '$_prefix$deckId');
  }

  /// Wipe complet (révoqué par le serveur).
  Future<void> wipe() async {
    final all = await _storage.readAll();
    for (final k in all.keys) {
      if (k.startsWith(_prefix)) {
        await _storage.delete(key: k);
      }
    }
  }

  Future<List<String>> listDecks() async {
    final all = await _storage.readAll();
    return all.keys
        .where((k) => k.startsWith(_prefix))
        .map((k) => k.substring(_prefix.length))
        .toList();
  }
}
