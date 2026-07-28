/// Tests golden du moteur FSRS-5.
///
/// Les valeurs attendues proviennent de `tools/fsrs_reference.py`, une
/// implémentation de référence indépendante des mêmes formules. Un écart entre
/// les deux signale une erreur de transcription dans le moteur Dart.
///
/// Régénérer après une évolution volontaire des formules :
///     python3 tools/generate_golden.py
library;

import 'dart:convert';
import 'dart:io';

import 'package:medanki_dz/core/srs/fsrs_engine.dart';
import 'package:medanki_dz/core/srs/fsrs_parameters.dart';
import 'package:medanki_dz/core/srs/review_event.dart';
import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:test/test.dart';

/// Tolérance sur les flottants : on compare deux implémentations utilisant les
/// mêmes doubles IEEE-754, l'écart ne doit venir que de l'ordre des opérations.
const double kEpsilon = 1e-9;

Map<String, dynamic> _loadGolden() {
  final File file = File('test/srs/golden_scenarios.json');
  if (!file.existsSync()) {
    throw StateError(
      'golden_scenarios.json introuvable. Lancer : python3 tools/generate_golden.py',
    );
  }
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

CardType _cardType(String wire) => CardType.fromWire(wire);

void main() {
  final Map<String, dynamic> golden = _loadGolden();
  const FsrsEngine engine = FsrsEngine();

  group('Poids du modèle', () {
    test('les 19 poids Dart correspondent à la référence', () {
      final List<double> expected = (golden['weights'] as List<dynamic>)
          .map((dynamic e) => (e as num).toDouble())
          .toList();
      expect(kDefaultFsrsWeights, hasLength(19));
      for (int i = 0; i < 19; i++) {
        expect(kDefaultFsrsWeights[i], closeTo(expected[i], kEpsilon),
            reason: 'w[$i]');
      }
    });

    test('kFactor vaut 19/81 par construction', () {
      expect(kFactor, closeTo(19 / 81, 1e-12));
    });
  });

  group('Primitives mathématiques', () {
    final Map<String, dynamic> math =
        golden['math'] as Map<String, dynamic>;

    test('retrievability R(t,S)', () {
      for (final dynamic raw in math['retrievability'] as List<dynamic>) {
        final Map<String, dynamic> c = raw as Map<String, dynamic>;
        final double actual = engine.retrievability(
          (c['elapsedDays'] as num).toDouble(),
          (c['stability'] as num).toDouble(),
        );
        expect(actual, closeTo((c['expected'] as num).toDouble(), kEpsilon),
            reason: 't=${c['elapsedDays']} S=${c['stability']}');
      }
    });

    test('R vaut 1 à t=0 et 0.9 à t=S', () {
      for (final double s in <double>[1, 3.173, 10, 100, 365]) {
        expect(engine.retrievability(0, s), closeTo(1.0, 1e-12));
        expect(engine.retrievability(s, s), closeTo(0.9, 1e-12));
      }
    });

    test('R décroît strictement avec le temps', () {
      double previous = 1.0;
      for (int t = 1; t <= 200; t++) {
        final double r = engine.retrievability(t.toDouble(), 10);
        expect(r, lessThan(previous), reason: 't=$t');
        previous = r;
      }
    });

    test('intervalFromStability pour plusieurs rétentions cibles', () {
      for (final dynamic raw
          in math['intervalFromStability'] as List<dynamic>) {
        final Map<String, dynamic> c = raw as Map<String, dynamic>;
        final FsrsEngine e = FsrsEngine(
          parameters: FsrsParameters(
            requestRetention: (c['requestRetention'] as num).toDouble(),
          ),
        );
        expect(
          e.intervalFromStability((c['stability'] as num).toDouble()),
          closeTo((c['expected'] as num).toDouble(), 1e-9),
          reason: 'S=${c['stability']} r=${c['requestRetention']}',
        );
      }
    });

    test('une rétention cible plus haute donne un intervalle plus court', () {
      const FsrsEngine strict =
          FsrsEngine(parameters: FsrsParameters(requestRetention: 0.95));
      const FsrsEngine lax =
          FsrsEngine(parameters: FsrsParameters(requestRetention: 0.8));
      expect(strict.intervalFromStability(50),
          lessThan(lax.intervalFromStability(50)));
    });

    test('stabilité et difficulté initiales par note', () {
      for (final dynamic raw in math['initialStability'] as List<dynamic>) {
        final Map<String, dynamic> c = raw as Map<String, dynamic>;
        final Rating r = Rating.fromValue(c['rating'] as int);
        final SrsCardState s =
            engine.applyReview(SrsCardState.initial, r, 0);
        expect(s.stability, closeTo((c['expected'] as num).toDouble(), kEpsilon),
            reason: 'S0(${r.name})');
      }
      for (final dynamic raw in math['initialDifficulty'] as List<dynamic>) {
        final Map<String, dynamic> c = raw as Map<String, dynamic>;
        final Rating r = Rating.fromValue(c['rating'] as int);
        final SrsCardState s =
            engine.applyReview(SrsCardState.initial, r, 0);
        expect(s.difficulty, closeTo((c['expected'] as num).toDouble(), kEpsilon),
            reason: 'D0(${r.name})');
      }
    });
  });

  group('Scénarios golden', () {
    final List<dynamic> scenarios = golden['scenarios'] as List<dynamic>;

    test('le jeu couvre au moins 30 scénarios', () {
      expect(scenarios.length, greaterThanOrEqualTo(30));
    });

    for (final dynamic rawScenario in scenarios) {
      final Map<String, dynamic> scenario =
          rawScenario as Map<String, dynamic>;
      final String name = scenario['name'] as String;
      final CardType type = _cardType(scenario['cardType'] as String);
      final List<dynamic> steps = scenario['steps'] as List<dynamic>;

      test('$name — ${scenario['description']}', () {
        SrsCardState state = SrsCardState.initial;
        for (int i = 0; i < steps.length; i++) {
          final Map<String, dynamic> step = steps[i] as Map<String, dynamic>;
          state = engine.applyReview(
            state,
            Rating.fromValue(step['rating'] as int),
            step['nowMs'] as int,
            cardType: type,
          );

          final String at = '$name[$i] (${step['ratingName']})';
          expect(state.state.wire, step['state'] as String, reason: '$at state');
          expect(state.stability,
              closeTo((step['stability'] as num).toDouble(), 1e-6),
              reason: '$at stability');
          expect(state.difficulty,
              closeTo((step['difficulty'] as num).toDouble(), 1e-6),
              reason: '$at difficulty');
          expect(state.elapsedDays, step['elapsedDays'] as int,
              reason: '$at elapsedDays');
          expect(state.scheduledDays, step['scheduledDays'] as int,
              reason: '$at scheduledDays');
          expect(state.reps, step['reps'] as int, reason: '$at reps');
          expect(state.lapses, step['lapses'] as int, reason: '$at lapses');
          expect(state.isLeech, step['isLeech'] as bool, reason: '$at isLeech');
          expect(state.dueMs, step['dueMs'] as int?, reason: '$at dueMs');
        }
      });
    }
  });

  group('Aperçu des quatre boutons', () {
    for (final dynamic raw in golden['previews'] as List<dynamic>) {
      final Map<String, dynamic> p = raw as Map<String, dynamic>;
      test('intervalles proposés depuis un état ${p['name']}', () {
        SrsCardState state = SrsCardState.initial;
        int now = golden['t0'] as int;
        final List<dynamic> build = p['buildSteps'] as List<dynamic>;
        for (int i = 0; i < build.length; i++) {
          final Map<String, dynamic> s = build[i] as Map<String, dynamic>;
          if (i > 0) {
            now += ((s['gapDays'] as num) * kMillisPerDay).toInt();
          }
          state = engine.applyReview(
              state, Rating.fromValue(s['rating'] as int), now);
        }

        final SchedulingPreview preview =
            engine.preview(state, p['probeMs'] as int);
        final Map<String, dynamic> expected =
            p['intervals'] as Map<String, dynamic>;

        expect(preview.again.scheduledDays, expected['again'] as int);
        expect(preview.hard.scheduledDays, expected['hard'] as int);
        expect(preview.good.scheduledDays, expected['good'] as int);
        expect(preview.easy.scheduledDays, expected['easy'] as int);
      });
    }

    test('les intervalles sont croissants : Again ≤ Hard ≤ Good ≤ Easy', () {
      SrsCardState state = SrsCardState.initial;
      int now = 1700000000000;
      // On construit une carte mûre.
      for (final int gap in <int>[0, 0, 4, 12, 30]) {
        now += gap * kMillisPerDay;
        state = engine.applyReview(state, Rating.good, now);
      }
      final SchedulingPreview p =
          engine.preview(state, now + 30 * kMillisPerDay);
      expect(p.again.scheduledDays, lessThanOrEqualTo(p.hard.scheduledDays));
      expect(p.hard.scheduledDays, lessThanOrEqualTo(p.good.scheduledDays));
      expect(p.good.scheduledDays, lessThanOrEqualTo(p.easy.scheduledDays));
    });

    test('preview ne modifie pas l\'état courant', () {
      SrsCardState state = engine.applyReview(
          SrsCardState.initial, Rating.good, 1700000000000);
      final SrsCardState before = state;
      engine.preview(state, 1700000000000 + kMillisPerDay);
      expect(state, before);
    });
  });

  group('Pondération QCM', () {
    test('un QCM gagne moins de stabilité qu\'une carte à rappel actif', () {
      final Map<String, dynamic> qcm = (golden['scenarios'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .firstWhere((Map<String, dynamic> s) => s['name'] == 'qcm_weighted');
      final Map<String, dynamic> basic = (golden['scenarios'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .firstWhere(
              (Map<String, dynamic> s) => s['name'] == 'basic_baseline');

      final double qcmFinal = (((qcm['steps'] as List<dynamic>).last
              as Map<String, dynamic>)['stability'] as num)
          .toDouble();
      final double basicFinal = (((basic['steps'] as List<dynamic>).last
              as Map<String, dynamic>)['stability'] as num)
          .toDouble();
      expect(qcmFinal, lessThan(basicFinal));
    });

    test('la pondération peut être désactivée', () {
      const FsrsEngine off =
          FsrsEngine(parameters: FsrsParameters(enableQcmWeighting: false));
      SrsCardState a = SrsCardState.initial;
      SrsCardState b = SrsCardState.initial;
      int now = 1700000000000;
      for (final int gap in <int>[0, 0, 5, 15]) {
        now += gap * kMillisPerDay;
        a = off.applyReview(a, Rating.good, now, cardType: CardType.qcm);
        b = off.applyReview(b, Rating.good, now, cardType: CardType.basic);
      }
      expect(a.stability, closeTo(b.stability, kEpsilon));
    });
  });

  group('fold — journal d\'événements', () {
    final Map<String, dynamic> foldCase =
        golden['fold'] as Map<String, dynamic>;

    List<ReviewEvent> buildEvents() {
      return (foldCase['events'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map((Map<String, dynamic> e) => ReviewEvent(
                id: e['id'] as String,
                cardId: 'card-1',
                userId: 'user-1',
                deviceId: 'device-A',
                rating: Rating.fromValue(e['rating'] as int),
                reviewedAtMs: e['reviewedAt'] as int,
                cardType: _cardType(e['cardType'] as String),
                examMode: e['examMode'] as bool,
              ))
          .toList();
    }

    void expectMatches(SrsCardState state, Map<String, dynamic> expected) {
      expect(state.state.wire, expected['state'] as String);
      expect(state.stability,
          closeTo((expected['stability'] as num).toDouble(), 1e-6));
      expect(state.difficulty,
          closeTo((expected['difficulty'] as num).toDouble(), 1e-6));
      expect(state.scheduledDays, expected['scheduledDays'] as int);
      expect(state.reps, expected['reps'] as int);
      expect(state.lapses, expected['lapses'] as int);
    }

    test('fold reproduit l\'état de référence', () {
      expectMatches(engine.fold(buildEvents()),
          foldCase['expected'] as Map<String, dynamic>);
    });

    test('un événement en mode examen ne décale pas la planification', () {
      final Map<String, dynamic> raw =
          foldCase['examEvent'] as Map<String, dynamic>;
      final ReviewEvent exam = ReviewEvent(
        id: raw['id'] as String,
        cardId: 'card-1',
        userId: 'user-1',
        deviceId: 'device-B',
        rating: Rating.fromValue(raw['rating'] as int),
        reviewedAtMs: raw['reviewedAt'] as int,
        cardType: _cardType(raw['cardType'] as String),
        examMode: true,
      );
      final SrsCardState withExam =
          engine.fold(<ReviewEvent>[...buildEvents(), exam]);
      expectMatches(withExam, foldCase['expectedWithExam'] as Map<String, dynamic>);
      expect(withExam, engine.fold(buildEvents()),
          reason: 'l\'examen blanc doit être neutre pour le scheduler');
    });
  });
}
