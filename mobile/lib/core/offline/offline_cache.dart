// OfflineCacheManager — Phase 15.4.
//
// Gère le cache de bundles deck pour révision offline. Le flow :
//   1. L'utilisateur télécharge un deck premium (Phase 14 — wrap
//      RSA-OAEP, déchiffrement AES-GCM).
//   2. On stocke le bundle déchiffré (JSON) sur disque, chiffré
//      au repos (AES-GCM avec une deviceKey locale).
//   3. En mode avion, l'app charge le deck depuis le cache.
//   4. Les revues effectuées offline sont stockées dans l'outbox
//      et push à la reconnexion (Phase 8 — déjà en place).
//
// v2 §14 : « Test d'acceptation non négociable : ouvrir l'app en
// mode avion, réviser 50 cartes, fermer — zéro appel réseau
// bloquant ». Le OfflineCacheManager est la condition technique
// de ce test.
//
// v2 §3 : « Stockage sécurisé pour les tokens (Android Keystore,
// iOS Keychain) ». Ici on parle du **contenu** des decks premium,
// pas des tokens : on utilise le file system de l'app (sandbox
// iOS / scoped storage Android) avec chiffrement AES-GCM au repos.

library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../security/aes_gcm.dart';
import 'connectivity_aware.dart';

class CachedDeck {
  const CachedDeck({
    required this.deckId,
    required this.bundlePath,
    required this.sizeBytes,
    required this.cachedAt,
    required this.lastAccessedAt,
  });
  final String deckId;
  final String bundlePath;
  final int sizeBytes;
  final DateTime cachedAt;
  final DateTime lastAccessedAt;
}

class OfflineCacheManager {
  OfflineCacheManager({
    AesGcmCipher? cipher,
    Future<Directory> Function()? documentsDirProvider,
  })  : _cipher = cipher ?? AesGcmCipher(),
        _documentsDirProvider = documentsDirProvider ?? getApplicationDocumentsDirectory;

  final AesGcmCipher _cipher;
  final Future<Directory> Function() _documentsDirProvider;

  /// Dossier où on stocke les bundles chiffrés.
  Future<Directory> _cacheDir() async {
    final root = await _documentsDirProvider();
    final dir = Directory(p.join(root.path, 'offline_decks'));
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }
    return dir;
  }

  /// Vérifie qu'on a un cache utilisable. Renvoie `false` si
  /// mode avion OU si le bundle n'existe pas.
  Future<bool> canServeOffline(String deckId) async {
    final path = await _bundlePath(deckId);
    return File(path).existsSync();
  }

  /// Lit un bundle depuis le cache, le déchiffre, et retourne le
  /// JSON. Lève une exception si pas en cache ou si le déchiffrement
  /// échoue (intégrité compromise).
  Future<Map<String, dynamic>> loadBundle({
    required String deckId,
    required Uint8List encryptionKey,
  }) async {
    final path = await _bundlePath(deckId);
    final file = File(path);
    if (!file.existsSync()) {
      throw StateError('deck $deckId non disponible hors-ligne');
    }
    final bytes = await file.readAsBytes();
    final deck = await _cipher.decryptJson(
      key: encryptionKey,
      bundle: EncryptedDeck.fromBytes(bytes: Uint8List.fromList(bytes), keyId: 'cache'),
    );
    // Update last accessed.
    final meta = File(await _metaPath(deckId));
    if (meta.existsSync()) {
      final m = jsonDecode(meta.readAsStringSync()) as Map<String, dynamic>;
      m['last_accessed_at'] = DateTime.now().toIso8601String();
      meta.writeAsStringSync(jsonEncode(m));
    }
    return deck;
  }

  /// Persiste un bundle déchiffré dans le cache, chiffré au repos
  /// avec `encryptionKey` (fournie par DeckKeyStore).
  Future<CachedDeck> saveBundle({
    required String deckId,
    required Map<String, dynamic> bundle,
    required Uint8List encryptionKey,
  }) async {
    final enc = await _cipher.encryptJson(
      key: encryptionKey,
      json: bundle,
      keyId: 'cache',
    );
    final path = await _bundlePath(deckId);
    await File(path).writeAsBytes(enc.toBytes());
    final now = DateTime.now();
    final meta = {
      'deck_id': deckId,
      'size_bytes': enc.toBytes().length,
      'cached_at': now.toIso8601String(),
      'last_accessed_at': now.toIso8601String(),
    };
    await File(await _metaPath(deckId)).writeAsString(jsonEncode(meta));
    return CachedDeck(
      deckId: deckId,
      bundlePath: path,
      sizeBytes: enc.toBytes().length,
      cachedAt: now,
      lastAccessedAt: now,
    );
  }

  /// Supprime un bundle du cache.
  Future<void> evict(String deckId) async {
    final path = await _bundlePath(deckId);
    if (File(path).existsSync()) await File(path).delete();
    final meta = await _metaPath(deckId);
    if (File(meta).existsSync()) await File(meta).delete();
  }

  /// Liste tous les decks en cache.
  Future<List<CachedDeck>> listAll() async {
    final dir = await _cacheDir();
    final out = <CachedDeck>[];
    for (final f in dir.listSync()) {
      if (!f.path.endsWith('.meta.json')) continue;
      try {
        final m = jsonDecode(File(f.path).readAsStringSync()) as Map<String, dynamic>;
        out.add(
          CachedDeck(
            deckId: m['deck_id'] as String,
            bundlePath: p.join(dir.path, '${m['deck_id']}.bundle.enc'),
            sizeBytes: (m['size_bytes'] as num).toInt(),
            cachedAt: DateTime.parse(m['cached_at'] as String),
            lastAccessedAt: DateTime.parse(m['last_accessed_at'] as String),
          ),
        );
      } catch (_) {
        // Meta corrompue, on ignore.
      }
    }
    return out;
  }

  /// Calcule l'espace total utilisé par le cache.
  Future<int> totalSizeBytes() async {
    final all = await listAll();
    return all.fold(0, (sum, c) => sum + c.sizeBytes);
  }

  /// Purge les bundles les plus anciens (LRU) pour rester sous
  /// `maxBytes`.
  Future<List<String>> evictLru(int maxBytes) async {
    final all = await listAll();
    all.sort((a, b) => a.lastAccessedAt.compareTo(b.lastAccessedAt));
    let total = await totalSizeBytes();
    final evicted = <String>[];
    for (final c in all) {
      if (total <= maxBytes) break;
      await evict(c.deckId);
      total -= c.sizeBytes;
      evicted.add(c.deckId);
    }
    return evicted;
  }

  Future<String> _bundlePath(String deckId) async {
    final dir = await _cacheDir();
    return p.join(dir.path, '$deckId.bundle.enc');
  }

  Future<String> _metaPath(String deckId) async {
    final dir = await _cacheDir();
    return p.join(dir.path, '$deckId.meta.json');
  }
}
