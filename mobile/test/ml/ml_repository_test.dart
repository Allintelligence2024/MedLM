// Tests Phase 20.3 — MlRepository (mock de l'ApiClient).
//
// On vérifie le mapping endpoint → modèle et que les variantes
// *OrNull ne lancent jamais (offline-first).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/network/api_exceptions.dart';
import 'package:medanki_dz/data/repositories/ml/ml_models.dart';
import 'package:medanki_dz/data/repositories/ml/ml_repository.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'http://test', tokenStorage: _NoopStorage());

  int predictionCalls = 0;
  int tagFocusCalls = 0;
  bool fail = false;

  @override
  Future<Map<String, dynamic>> fetchMockExamPrediction() async {
    predictionCalls++;
    if (fail) throw const NetworkException('offline');
    return <String, dynamic>{
      'user_id': 'u1',
      'window_days': 30,
      'predictible': true,
      'scorePercent': 78.2,
      'band': 'high',
      'marginPercent': 6.7,
      'modelVersion': 'v1.0.0',
      'features': const {
        'reviews30d': 320,
        'accuracy30d': 0.9,
        'coverageRatio': 0.6,
        'matureRatio': 0.5,
        'streakDays': 20,
      },
    };
  }

  @override
  Future<Map<String, dynamic>> fetchTagFocus() async {
    tagFocusCalls++;
    if (fail) throw const NetworkException('offline');
    return <String, dynamic>{
      'user_id': 'u1',
      'window_days': 30,
      'focus': const [
        {
          'tag': 'biochimie',
          'kind': 'focus',
          'reviews': 30,
          'lapses': 12,
          'lapseRate': 0.4,
          'reason': "taux d'échec 40% ≥ 35% sur 30 revues",
        },
      ],
      'relax': const [],
    };
  }
}

// Même astuce que les tests IA : pas de flutter_secure_storage en
// environnement de test (canal plateforme absent).
class _NoopStorage implements dynamic {
  @override
  noSuchMethod(Invocation invocation) async => null;
}

void main() {
  group('MlRepository', () {
    test('mockExamPrediction mappe l\u2019union « predictible »', () async {
      final api = FakeApiClient();
      final repo = MlRepository(api: api);
      final p = await repo.mockExamPrediction();
      expect(api.predictionCalls, 1);
      expect(p.predictible, isTrue);
      expect(p.scorePercent, 78.2);
      expect(p.band, ScoreBand.high);
      expect(p.features.streakDays, 20);
    });

    test('tagFocus mappe focus/relax', () async {
      final api = FakeApiClient();
      final repo = MlRepository(api: api);
      final r = await repo.tagFocus();
      expect(api.tagFocusCalls, 1);
      expect(r.focus, hasLength(1));
      expect(r.focus.single.tag, 'biochimie');
      expect(r.relax, isEmpty);
    });

    test('les variantes OrNull ne lancent jamais (offline)', () async {
      final api = FakeApiClient()..fail = true;
      final repo = MlRepository(api: api);
      expect(await repo.mockExamPredictionOrNull(), isNull);
      expect(await repo.tagFocusOrNull(), isNull);
      // Les variantes strictes, elles, propagent — choix du caller.
      expect(repo.mockExamPrediction, throwsA(isA<NetworkException>()));
      expect(repo.tagFocus, throwsA(isA<NetworkException>()));
    });
  });
}
