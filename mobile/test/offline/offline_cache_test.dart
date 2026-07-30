// Tests OfflineCacheManager — Phase 15.4.
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/offline/offline_cache.dart';
import 'package:path/path.dart' as p;

void main() {
  late Directory tempDir;
  late OfflineCacheManager cache;
  late Uint8List key;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('offline_test_');
    cache = OfflineCacheManager(
      documentsDirProvider: () async => tempDir,
    );
    key = Uint8List.fromList(List<int>.generate(32, (i) => (i * 7) & 0xff));
  });

  tearDown(() async {
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  test('canServeOffline retourne false si pas en cache', () async {
    expect(await cache.canServeOffline('d-unknown'), isFalse);
  });

  test('saveBundle puis canServeOffline', () async {
    await cache.saveBundle(
      deckId: 'd1',
      bundle: {'cards': [{'id': 'c1', 'fr': 'coeur'}]},
      encryptionKey: key,
    );
    expect(await cache.canServeOffline('d1'), isTrue);
  });

  test('loadBundle déchiffre et retourne le JSON', () async {
    final original = {
      'cards': [
        {'id': 'c1', 'fr': 'coeur'},
        {'id': 'c2', 'fr': 'poumon'},
      ],
    };
    await cache.saveBundle(deckId: 'd1', bundle: original, encryptionKey: key);
    final loaded = await cache.loadBundle(deckId: 'd1', encryptionKey: key);
    expect(loaded, equals(original));
  });

  test('loadBundle échoue si mauvaise clé', () async {
    await cache.saveBundle(
      deckId: 'd1',
      bundle: {'cards': []},
      encryptionKey: key,
    );
    final wrongKey = Uint8List.fromList(List<int>.generate(32, (i) => 99));
    expect(
      () => cache.loadBundle(deckId: 'd1', encryptionKey: wrongKey),
      throwsA(anything),
    );
  });

  test('evict supprime le bundle et la meta', () async {
    await cache.saveBundle(
      deckId: 'd1',
      bundle: {'cards': []},
      encryptionKey: key,
    );
    expect(await cache.canServeOffline('d1'), isTrue);
    await cache.evict('d1');
    expect(await cache.canServeOffline('d1'), isFalse);
  });

  test('listAll retourne tous les decks cachés', () async {
    await cache.saveBundle(deckId: 'd1', bundle: {'cards': []}, encryptionKey: key);
    await cache.saveBundle(deckId: 'd2', bundle: {'cards': []}, encryptionKey: key);
    await cache.saveBundle(deckId: 'd3', bundle: {'cards': []}, encryptionKey: key);
    final all = await cache.listAll();
    expect(all.length, equals(3));
    final ids = all.map((c) => c.deckId).toSet();
    expect(ids, containsAll(['d1', 'd2', 'd3']));
  });

  test('totalSizeBytes est la somme des tailles', () async {
    await cache.saveBundle(deckId: 'd1', bundle: {'cards': []}, encryptionKey: key);
    await cache.saveBundle(deckId: 'd2', bundle: {'cards': [{'x': 'y'}]}, encryptionKey: key);
    final total = await cache.totalSizeBytes();
    expect(total, greaterThan(0));
  });

  test('evictLru purge les plus anciens', () async {
    await cache.saveBundle(deckId: 'old', bundle: {'cards': []}, encryptionKey: key);
    // Force un sleep pour avoir un lastAccessedAt différent.
    await Future<void>.delayed(const Duration(milliseconds: 10));
    await cache.saveBundle(deckId: 'new', bundle: {'cards': []}, encryptionKey: key);
    // maxBytes = 0 → on doit tout purger.
    final evicted = await cache.evictLru(0);
    expect(evicted, isNotEmpty);
    expect(await cache.canServeOffline('old'), isFalse);
  });

  test('evictLru garde tout si sous le seuil', () async {
    await cache.saveBundle(deckId: 'd1', bundle: {'cards': []}, encryptionKey: key);
    final evicted = await cache.evictLru(1024 * 1024); // 1 Mo
    expect(evicted, isEmpty);
    expect(await cache.canServeOffline('d1'), isTrue);
  });
}
