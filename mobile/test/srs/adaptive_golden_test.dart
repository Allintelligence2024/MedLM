/// Tests golden du FSRS adaptatif (Phase 19.6).
///
/// Consomme la section `adaptive` de `golden_scenarios.json` (générée par
/// `tools/generate_golden.py`, miroir de `adaptive.service.ts`) :
///   * `adjustmentCases` vérifient que `FsrsAdaptive.computeAdjustment`
///     produit exactement les mêmes poids que le backend (seuils,
///     facteurs, bornes) ;
///   * `scenarios` rejouent des parcours complets avec les poids ajustés
///     — verrou de parité bout-en-bout entre le moteur Dart et la
///     référence Python (elle-même alignée sur ts-fsrs).
///
/// Régénérer après une évolution volontaire : python3 tools/generate_golden.py
library;

import 'dart:convert';
import 'dart:io';

import 'package:medanki_dz/core/srs/fsrs_adaptive.dart';
import 'package:medanki_dz/core/srs/fsrs_engine.dart';
import 'package:medanki_dz/core/srs/fsrs_parameters.dart';
import 'package:medanki_dz/core/srs/review_event.dart';
import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:test/test.dart';

Map<String, dynamic> _loadGolden() {
  final File file = File('test/srs/golden_scenarios.json');
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

void main() {
  final Map<String, dynamic> golden = _loadGolden();
  final Map<String, dynamic> adaptive =
      golden['adaptive'] as Map<String, dynamic>;

  group('Ajustement adaptatif (parité backend 18.4)', () {
    final List<dynamic> cases = adaptive['adjustmentCases'] as List<dynamic>;

    test('le jeu couvre les 3 profils et les bornes', () {
      expect(cases.length, greaterThanOrEqualTo(8));
    });

    for (final dynamic raw in cases) {
      final Map<String, dynamic> c = raw as Map<String, dynamic>;
      test('${c['name']}', () {
        final AdaptiveAdjustment adj = FsrsAdaptive.computeAdjustment(
          totalReviews: c['totalReviews'] as int,
          lapseRate: (c['lapseRate'] as num).toDouble(),
        );
        expect(
          adj.changedIndices,
          (c['expectedChangedIndices'] as List<dynamic>).cast<int>(),
        );
        final List<double> expected =
            (c['expectedWeights'] as List<dynamic>)
                .map((dynamic e) => (e as num).toDouble())
                .toList();
        for (int i = 0; i < 19; i++) {
          expect(adj.weights[i], closeTo(expected[i], 1e-12),
              reason: '${c['name']} w[$i]');
        }
      });
    }

    test('les poids ajustés restent dans [0.5×, 2×] de la base', () {
      for (double rate = 0.0; rate <= 1.0; rate += 0.01) {
        for (final int reviews in <int>[0, 100, 200, 500, 5000]) {
          final AdaptiveAdjustment adj = FsrsAdaptive.computeAdjustment(
            totalReviews: reviews,
            lapseRate: rate,
          );
          for (int i = 0; i < 19; i++) {
            expect(adj.weights[i],
                greaterThanOrEqualTo(kDefaultFsrsWeights[i] * 0.5));
            expect(adj.weights[i],
                lessThanOrEqualTo(kDefaultFsrsWeights[i] * 2.0));
          }
        }
      }
    });

    test('parametersFromAdjustment retombe sur le défaut si payload '
        'invalide', () {
      void expectDefault(dynamic bad) {
        final FsrsParameters p = FsrsAdaptive.parametersFromAdjustment(bad);
        expect(p.weights, kDefaultFsrsWeights);
      }

      expectDefault(null);
      expectDefault(const _BadWeights(<double>[1, 2, 3]));
      expectDefault(_BadWeights(List<double>.filled(19, 0)));
    });
  });

  group('Séquences golden avec poids ajustés', () {
    final List<dynamic> scenarios = adaptive['scenarios'] as List<dynamic>;

    for (final dynamic rawScenario in scenarios) {
      final Map<String, dynamic> scenario =
          rawScenario as Map<String, dynamic>;
      final String name = scenario['name'] as String;

      test('$name — ${scenario['description']}', () {
        // Reconstruit les poids attendus depuis la description du
        // scénario : fragile → w11×1.15, fort → w8×1.05 (cf. générateur).
        final bool fragile = name.contains('fragile');
        final AdaptiveAdjustment adj = FsrsAdaptive.computeAdjustment(
          totalReviews: fragile ? 300 : 400,
          lapseRate: fragile ? 0.4 : 0.02,
        );
        final FsrsEngine engine = FsrsEngine(
          parameters: FsrsParameters(weights: adj.weights),
        );

        SrsCardState state = SrsCardState.initial;
        final List<dynamic> steps = scenario['steps'] as List<dynamic>;
        for (int i = 0; i < steps.length; i++) {
          final Map<String, dynamic> step = steps[i] as Map<String, dynamic>;
          state = engine.applyReview(
            state,
            Rating.fromValue(step['rating'] as int),
            step['nowMs'] as int,
            cardType: CardType.fromWire(scenario['cardType'] as String),
          );
          final String at = '$name[$i] (${step['ratingName']})';
          expect(state.state.wire, step['state'] as String, reason: '$at state');
          expect(state.stability,
              closeTo((step['stability'] as num).toDouble(), 1e-6),
              reason: '$at stability');
          expect(state.difficulty,
              closeTo((step['difficulty'] as num).toDouble(), 1e-6),
              reason: '$at difficulty');
          expect(state.scheduledDays, step['scheduledDays'] as int,
              reason: '$at scheduledDays');
          expect(state.dueMs, step['dueMs'] as int?, reason: '$at dueMs');
        }
      });
    }

    test('le profil fragile améliore la stabilité post-oubli', () {
      // Même parcours qu'adaptive_fragile_lapse_recovery en poids par
      // défaut : la stabilité après le AGAIN doit être inférieure à
      // celle du scénario ajusté (w11 ×1.15 la reconstruit plus vite).
      final SrsCardState baseline = _replay(
        const FsrsEngine(),
        const [(Rating.good, 0), (Rating.good, 0), (Rating.good, 4), (Rating.again, 14)],
      );
      final AdaptiveAdjustment adj = FsrsAdaptive.computeAdjustment(
          totalReviews: 300, lapseRate: 0.4);
      final SrsCardState adjusted = _replay(
        FsrsEngine(parameters: FsrsParameters(weights: adj.weights)),
        const [(Rating.good, 0), (Rating.good, 0), (Rating.good, 4), (Rating.again, 14)],
      );
      expect(adjusted.stability, greaterThan(baseline.stability));
    });
  });
}

class _BadWeights {
  const _BadWeights(this.weights);
  final List<double> weights;
}

SrsCardState _replay(FsrsEngine engine, List<(Rating, int)> steps) {
  const int t0 = 1700000000000;
  SrsCardState state = SrsCardState.initial;
  int now = t0;
  for (int i = 0; i < steps.length; i++) {
    if (i > 0) now += steps[i].$2 * kMillisPerDay;
    state = engine.applyReview(state, steps[i].$1, now);
  }
  return state;
}
