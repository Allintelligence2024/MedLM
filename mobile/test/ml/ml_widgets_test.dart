// Tests widget Phase 20.3 — MlPredictionCard, TagFocusCard.
//
// Conformité vérifiée :
//   * la prédiction rend score, bande, marge ET les features
//     (explicabilité v2 §13) ainsi que la version du modèle ;
//   * le refus k-anonymat affiche la raison SERVIE (jamais un message
//     codé en dur différent) ;
//   * offline/erreur → les cartes s'effacent silencieusement ;
//   * tag-focus : puces focus/relax avec raisons accessibles.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/repositories/ml/ml_repository.dart';
import 'package:medanki_dz/ui/ml/ml_prediction_card.dart';
import 'package:medanki_dz/ui/ml/tag_focus_card.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient({this.fail = false, this.predictionPayload})
      : super(baseUrl: 'http://test', tokenStorage: _NoopStorage());

  final bool fail;
  final Map<String, dynamic>? predictionPayload;

  @override
  Future<Map<String, dynamic>> fetchMockExamPrediction() async {
    if (fail) throw Exception('offline');
    return predictionPayload ??
        <String, dynamic>{
          'user_id': 'u1',
          'window_days': 30,
          'predictible': true,
          'scorePercent': 55.3,
          'band': 'medium',
          'marginPercent': 8.9,
          'modelVersion': 'v1.0.0',
          'features': const {
            'reviews30d': 180,
            'accuracy30d': 0.72,
            'coverageRatio': 0.35,
            'matureRatio': 0.28,
            'streakDays': 9,
          },
        };
  }

  @override
  Future<Map<String, dynamic>> fetchTagFocus() async {
    if (fail) throw Exception('offline');
    return <String, dynamic>{
      'user_id': 'u1',
      'window_days': 30,
      'focus': const [
        {
          'tag': 'néphrologie',
          'kind': 'focus',
          'reviews': 25,
          'lapses': 11,
          'lapseRate': 0.44,
          'reason': "taux d'échec 44% ≥ 35% sur 25 revues",
        },
      ],
      'relax': const [
        {
          'tag': 'anatomie',
          'kind': 'relax',
          'reviews': 50,
          'lapses': 2,
          'lapseRate': 0.04,
          'reason': 'maîtrise démontrée : échecs 4% ≤ 10% sur 50 revues',
        },
      ],
    };
  }
}

class _NoopStorage implements dynamic {
  @override
  noSuchMethod(Invocation invocation) async => null;
}

Widget _wrap(Widget child) {
  return MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));
}

void main() {
  group('MlPredictionCard', () {
    testWidgets('affiche score, bande, marge, features et version',
        (tester) async {
      final repo = MlRepository(api: FakeApiClient());
      await tester.pumpWidget(_wrap(MlPredictionCard(repository: repo)));
      await tester.pumpAndSettle();
      expect(find.textContaining('55.3 %'), findsOneWidget);
      expect(find.textContaining('± 8.9'), findsOneWidget);
      expect(find.text('moyen'), findsOneWidget);
      // Explicabilité : features et modèle visibles.
      expect(find.textContaining('180 revues'), findsOneWidget);
      expect(find.textContaining('réussite 72 %'), findsOneWidget);
      expect(find.textContaining('Modèle v1.0.0'), findsOneWidget);
    });

    testWidgets('refus k-anonymat : raison servie affichée telle quelle',
        (tester) async {
      final repo = MlRepository(
        api: FakeApiClient(
          predictionPayload: const {
            'user_id': 'u1',
            'window_days': 30,
            'predictible': false,
            'reason': 'RAISON-SERVIE : 12 revues (minimum 50)',
            'modelVersion': 'v1.0.0',
            'features': {
              'reviews30d': 12,
              'accuracy30d': 0.5,
              'coverageRatio': 0.1,
              'matureRatio': 0.0,
              'streakDays': 2,
            },
          },
        ),
      );
      await tester.pumpWidget(_wrap(MlPredictionCard(repository: repo)));
      await tester.pumpAndSettle();
      expect(find.textContaining('RAISON-SERVIE'), findsOneWidget);
      expect(find.textContaining('%'), findsNothing);
    });

    testWidgets('offline → carte invisible, jamais de crash',
        (tester) async {
      final repo = MlRepository(api: FakeApiClient(fail: true));
      await tester.pumpWidget(_wrap(MlPredictionCard(repository: repo)));
      await tester.pumpAndSettle();
      expect(find.byType(Card), findsNothing);
    });
  });

  group('TagFocusCard', () {
    testWidgets('affiche puces focus et relax', (tester) async {
      final repo = MlRepository(api: FakeApiClient());
      await tester.pumpWidget(_wrap(TagFocusCard(repository: repo)));
      await tester.pumpAndSettle();
      expect(find.textContaining('néphrologie'), findsOneWidget);
      expect(find.textContaining('44%'), findsOneWidget);
      expect(find.textContaining('anatomie'), findsOneWidget);
      expect(find.textContaining('Où concentrer'), findsOneWidget);
    });

    testWidgets('offline → carte invisible', (tester) async {
      final repo = MlRepository(api: FakeApiClient(fail: true));
      await tester.pumpWidget(_wrap(TagFocusCard(repository: repo)));
      await tester.pumpAndSettle();
      expect(find.byType(Card), findsNothing);
    });
  });
}
