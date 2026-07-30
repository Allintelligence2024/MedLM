// SecureDeckRepository — orchestre la distribution d'un deck
// premium offline (Phase 14).
//
// Flux :
//   1. L'utilisateur demande à télécharger un deck premium.
//   2. On s'assure que la `DeviceKeyPair` existe (génère si besoin).
//   3. On envoie la clé publique au backend → on reçoit la clé
//      AES wrappée.
//   4. On déwrap la clé avec la clé privée locale.
//   5. On télécharge le bundle chiffré du deck.
//   6. On déchiffre le bundle et on le stocke dans la DB locale.
//   7. On persiste la `deckKey` dans le `DeckKeyStore` pour
//      usage futur.
library;

import 'dart:convert';
import 'dart:typed_data';

import '../../core/security/aes_gcm.dart';
import '../../core/security/deck_key_store.dart';
import '../../core/security/device_key_pair.dart';
import '../network/api_client.dart';
import '../network/secure_token_storage.dart';

class SecureDeckRepository {
  SecureDeckRepository({
    required this.api,
    required this.deviceKey,
    required this.deckKeyStore,
    required this.cipher,
    required this.tokenStorage,
  });

  final ApiClient api;
  final DeviceKeyPair deviceKey;
  final DeckKeyStore deckKeyStore;
  final AesGcmCipher cipher;
  final SecureTokenStorage tokenStorage;

  /// Télécharge et déchiffre un deck premium.
  /// Retourne le JSON du deck (cartes, métadonnées).
  Future<Map<String, dynamic>> downloadDeck({
    required String deckId,
    required Future<Uint8List> Function() downloadBundle,
  }) async {
    // 1. Récupère / crée la clé RSA locale.
    final pair = await deviceKey.getOrCreate();

    // 2. Récupère le deviceId.
    final deviceId = await tokenStorage.getOrCreateDeviceId();

    // 3. Demande le wrap au serveur.
    final wrapped = await api.wrapDeckKey(
      deckId: deckId,
      clientPublicKeyPem: pair.publicKeyPem,
      deviceId: deviceId,
    );

    // 4. Déwrap côté client.
    final deckKey = await deviceKey.unwrapDeckKey(
      wrappedKeyBase64: wrapped['wrapped_key'] as String,
    );

    // 5. Sauvegarde la clé pour usage futur.
    await deckKeyStore.saveKey(deckId, deckKey);

    // 6. Télécharge le bundle chiffré.
    final bundle = await downloadBundle();

    // 7. Déchiffre.
    final deckJson = await cipher.decryptJson(
      key: deckKey,
      bundle: EncryptedDeck.fromBytes(
        bytes: bundle,
        keyId: wrapped['key_id'] as String,
      ),
    );
    return deckJson;
  }
}
