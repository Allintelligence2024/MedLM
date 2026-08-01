// Tests — AdaptiveParamsCache + refreshAdaptiveFsrsParameters
// (worker de fond Phase 19.6).
//
// Vérifié :
//   * sérialisation round-trip (19 poids, raisons, fraîcheur) ;
//   * lecture défensive : JSON corrompu / poids invalides → null,
//     jamais d'exception nulle part dans le moteur ;
//   * TTL : isStale après 6 h ;
//   * refresh best-effort : échec réseau → false, rien n'est écrit ;
//   * refresh nominal : le profil servi est persisté (poids bornés).
library;

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/srs/fsrs_parameters.dart';
import 'package:medanki_dz/data/local/app_database.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/repositories/ai/adaptive_params_cache.dart';
import 'package:medanki_dz/data/repositories/ai/ai_repository.dart';

Map<String, dynamic> _profilePayload({required bool active}) {
  return <String, dynamic>{
    'user_id': 'u1',
    'window_days': 30,
    'total_reviews': 250,
    'lapses': 80,
    'lapse_rate': 0.32,
    'leech_cards': const [],
    'hot_tags': const [],
    'fsrs_adjustment': {
      'weights': List<double>.from(kDefaultFsrsWeights)
        ..[11] = kDefaultFsrsWeights[11] * 1.15,
      'changed_indices': active ? const [11] : const [],
      'reasons':
          active ? const ['lapse_rate élevé (32% ≥ 30%) → w11 ×1.15'] : const [],
      'active': active,
    },
  };
}

class FakeApiClient extends ApiClient {
  FakeApiClient({this.fail = false, this.payload})
      : super(baseUrl: 'http://test', tokenStorage: _NoopStorage());

  final bool fail;
  final Map<String, dynamic>? payload;

  @override
  Future<Map<String, dynamic>> fetchAdaptiveProfile() async {
    if (fail) throw Exception('offline');
    return payload ?? _profilePayload(active: true);
  }
}

class _NoopStorage implements dynamic {
  @override
  noSuchMethod(Invocation invocation) async => null;
}

void main() {
  late AppDatabase db;
  late AdaptiveParamsCache cache;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    cache = AdaptiveParamsCache(db: db);
  });

  tearDown(() => db.close());

  group('sérialisation (pure)', () {
    test('round-trip : poids, active, raisons, fraîcheur préservés', () {
      final now = DateTime.now().millisecondsSinceEpoch;
      final entry = CachedAdaptiveParams(
        parameters: const FsrsParameters(),
        fetchedAtMs: now,
        active: true,
        reasons: const ['w11 ×1.15'],
      );
      final decoded =
          AdaptiveParamsCache.decodeAdaptiveParams(
              AdaptiveParamsCache.encodeAdaptiveParams(entry))!;
      expect(decoded.fetchedAtMs, now);
      expect(decoded.active, isTrue);
      expect(decoded.reasons, ['w11 ×1.15']);
      expect(decoded.parameters.weights, kDefaultFsrsWeights);
    });

    test('poids ajustés : bornage revérifié au decode (w11 ×1.15)', () {
      final w = List<double>.from(kDefaultFsrsWeights)..[11] *= 1.15;
      final entry = CachedAdaptiveParams(
        parameters: FsrsParameters(weights: w),
        fetchedAtMs: 1,
        active: true,
        reasons: const [],
      );
      final decoded =
          AdaptiveParamsCache.decodeAdaptiveParams(
              AdaptiveParamsCache.encodeAdaptiveParams(entry))!;
      expect(decoded.parameters.weights[11],
          closeTo(kDefaultFsrsWeights[11] * 1.15, 1e-9));
    });

    test('JSON corrompu → null, jamais d\u2019exception', () {
      expect(AdaptiveParamsCache.decodeAdaptiveParams('{oops'), isNull);
      expect(AdaptiveParamsCache.decodeAdaptiveParams(''), isNull);
      expect(AdaptiveParamsCache.decodeAdaptiveParams('null'), isNull);
      expect(AdaptiveParamsCache.decodeAdaptiveParams('{"v":2}'), isNull);
    });

    test('poids invalides (pas 19 / négatifs) → moteur par défaut', () {
      final params = AdaptiveParamsCache.decodeAdaptiveParams(
        '{"v":1,"fetched_at":1,"weights":[1,2,3],"active":true,"reasons":[]}',
      );
      expect(params, isNotNull);
      expect(params!.parameters.weights, kDefaultFsrsWeights);
    });
  });

  group('TTL', () {
    const hour = 3600 * 1000;
    final cache0 = AdaptiveParamsCache(
      db: AppDatabase(NativeDatabase.memory()),
    );
    test('frais < 6 h, périmé ≥ 6 h', () {
      expect(cache0.isStale(0, 5 * hour), isFalse);
      expect(cache0.isStale(0, 6 * hour), isTrue);
    });
    test('TTL personnalisé respecté', () {
      final short = AdaptiveParamsCache(
        db: AppDatabase(NativeDatabase.memory()),
        ttlMs: hour,
      );
      expect(short.isStale(0, hour - 1), isFalse);
      expect(short.isStale(0, hour), isTrue);
    });
  });

  group('user_prefs (drift)', () {
    test('absent → null ; écrit puis relu ; clear', () async {
      expect(await cache.read(), isNull);
      final entry = CachedAdaptiveParams(
        parameters: const FsrsParameters(),
        fetchedAtMs: 42,
        active: true,
        reasons: const ['r'],
      );
      await cache.write(entry);
      final read = await cache.read();
      expect(read, isNotNull);
      expect(read!.fetchedAtMs, 42);
      expect(read.parameters.weights, kDefaultFsrsWeights);
      await cache.clear();
      expect(await cache.read(), isNull);
    });

    test('réécriture = remplacement (insertOnConflictUpdate)', () async {
      await cache.write(const CachedAdaptiveParams(
        parameters: FsrsParameters(),
        fetchedAtMs: 1,
        active: false,
        reasons: [],
      ));
      await cache.write(const CachedAdaptiveParams(
        parameters: FsrsParameters(),
        fetchedAtMs: 99,
        active: true,
        reasons: ['x'],
      ));
      final read = await cache.read();
      expect(read!.fetchedAtMs, 99);
      expect(read.active, isTrue);
    });
  });

  group('refreshAdaptiveFsrsParameters (worker)', () {
    test('nominal : profil servi persisté (w11 ×1.15, raisons)', () async {
      final ok = await refreshAdaptiveFsrsParameters(
        ai: AiRepository(api: FakeApiClient()),
        cache: cache,
        nowMs: 1000,
      );
      expect(ok, isTrue);
      final read = (await cache.read())!;
      expect(read.fetchedAtMs, 1000);
      expect(read.active, isTrue);
      expect(read.reasons.single, contains('w11'));
      expect(read.parameters.weights[11],
          closeTo(kDefaultFsrsWeights[11] * 1.15, 1e-9));
    });

    test('profil inactif servi → moteur par défaut, active=false', () async {
      final ok = await refreshAdaptiveFsrsParameters(
        ai: AiRepository(
            api: FakeApiClient(payload: _profilePayload(active: false))),
        cache: cache,
        nowMs: 1,
      );
      expect(ok, isTrue);
      final read = (await cache.read())!;
      expect(read.active, isFalse);
      expect(read.parameters.weights, kDefaultFsrsWeights);
    });

    test('offline → false, aucune écriture, aucune exception', () async {
      final ok = await refreshAdaptiveFsrsParameters(
        ai: AiRepository(api: FakeApiClient(fail: true)),
        cache: cache,
      );
      expect(ok, isFalse);
      expect(await cache.read(), isNull);
    });
  });
}
