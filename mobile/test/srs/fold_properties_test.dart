/// Propriétés du `fold` — garanties dont dépend toute la synchronisation.
///
/// L'architecture v2 pose : « Jam conflict → JAMAIS perdu ». Cette garantie
/// repose entièrement sur le fait que `fold` soit une fonction pure,
/// déterministe et commutative vis-à-vis de l'ordre d'insertion. Ces tests
/// vérifient ces propriétés sur des séquences pseudo-aléatoires, en simulant
/// des scénarios multi-appareils hors ligne.
library;

import 'dart:math';

import 'package:medanki_dz/core/srs/fsrs_engine.dart';
import 'package:medanki_dz/core/srs/fsrs_parameters.dart';
import 'package:medanki_dz/core/srs/review_event.dart';
import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:test/test.dart';

const FsrsEngine engine = FsrsEngine();
const int t0 = 1700000000000;

/// Génère un journal de revues plausible, reproductible via [seed].
List<ReviewEvent> generateLog({
  required int seed,
  int count = 20,
  String deviceId = 'device-A',
  bool withExamMode = false,
}) {
  final Random rng = Random(seed);
  final UuidV7 uuid = UuidV7(random: Random(seed + 1));
  final List<ReviewEvent> events = <ReviewEvent>[];
  int now = t0;
  for (int i = 0; i < count; i++) {
    now += rng.nextInt(5 * kMillisPerDay) + 60000;
    events.add(ReviewEvent(
      id: uuid.generate(nowMs: now),
      cardId: 'card-1',
      userId: 'user-1',
      deviceId: deviceId,
      rating: Rating.fromValue(rng.nextInt(4) + 1),
      reviewedAtMs: now,
      durationMs: rng.nextInt(30000),
      cardType: CardType.values[rng.nextInt(3)],
      examMode: withExamMode && rng.nextInt(5) == 0,
    ));
  }
  return events;
}

void main() {
  group('Déterminisme', () {
    test('mêmes événements ⇒ état identique, sur 100 journaux', () {
      for (int seed = 0; seed < 100; seed++) {
        final List<ReviewEvent> log = generateLog(seed: seed);
        expect(engine.fold(log), engine.fold(log), reason: 'seed=$seed');
      }
    });

    test('l\'ordre d\'insertion n\'influence pas le résultat', () {
      for (int seed = 0; seed < 100; seed++) {
        final List<ReviewEvent> log = generateLog(seed: seed);
        final SrsCardState reference = engine.fold(log);

        final List<ReviewEvent> shuffled = List<ReviewEvent>.of(log)
          ..shuffle(Random(seed + 999));
        expect(engine.fold(shuffled), reference, reason: 'mélangé, seed=$seed');

        final List<ReviewEvent> reversed = log.reversed.toList();
        expect(engine.fold(reversed), reference, reason: 'inversé, seed=$seed');
      }
    });

    test('fold est idempotent face aux doublons (push rejoué)', () {
      for (int seed = 0; seed < 50; seed++) {
        final List<ReviewEvent> log = generateLog(seed: seed);
        final SrsCardState once = engine.fold(log);
        final SrsCardState twice = engine.fold(<ReviewEvent>[...log, ...log]);
        final SrsCardState thrice =
            engine.fold(<ReviewEvent>[...log, ...log, ...log]);
        expect(twice, once, reason: 'seed=$seed');
        expect(thrice, once, reason: 'seed=$seed');
      }
    });

    test('les revues en mode examen sont neutres', () {
      for (int seed = 0; seed < 50; seed++) {
        final List<ReviewEvent> real = generateLog(seed: seed);
        final List<ReviewEvent> exams = generateLog(
          seed: seed + 5000,
          count: 10,
          deviceId: 'device-exam',
        ).map((ReviewEvent e) => e.copyWith(examMode: true)).toList();

        expect(engine.fold(<ReviewEvent>[...real, ...exams]),
            engine.fold(real),
            reason: 'seed=$seed');
      }
    });
  });

  group('Fusion multi-appareils', () {
    test('l\'union de deux journaux hors ligne ne perd aucune revue', () {
      for (int seed = 0; seed < 50; seed++) {
        final List<ReviewEvent> phone =
            generateLog(seed: seed, count: 12, deviceId: 'phone');
        final List<ReviewEvent> tablet =
            generateLog(seed: seed + 777, count: 9, deviceId: 'tablet');

        final SrsCardState merged = engine.mergeAndFold(phone, tablet);
        final SrsCardState mergedOtherWay =
            engine.mergeAndFold(tablet, phone);

        // Commutativité : peu importe qui synchronise en premier.
        expect(merged, mergedOtherWay, reason: 'seed=$seed');
        // Toutes les revues sont comptées, aucune n'est arbitrée ni écrasée.
        expect(merged.reps, phone.length + tablet.length, reason: 'seed=$seed');
      }
    });

    test('une synchronisation progressive converge vers l\'état final', () {
      // Le téléphone envoie ses événements par lots ; à chaque étape, l'état
      // recalculé doit correspondre au fold de ce qui a été reçu jusque-là.
      final List<ReviewEvent> all = generateLog(seed: 42, count: 30);
      final List<ReviewEvent> received = <ReviewEvent>[];
      for (int i = 0; i < all.length; i += 7) {
        received.addAll(all.skip(i).take(7));
        expect(engine.fold(received), engine.fold(received.reversed.toList()));
      }
      expect(engine.fold(received), engine.fold(all));
    });

    test('des revues simultanées sont départagées de façon stable', () {
      // Deux appareils enregistrent au même millième de seconde : le tri
      // secondaire par identifiant garantit un ordre identique partout.
      const int sameInstant = t0 + 3 * kMillisPerDay;
      ReviewEvent make(String id, Rating r, String device) => ReviewEvent(
            id: id,
            cardId: 'card-1',
            userId: 'user-1',
            deviceId: device,
            rating: r,
            reviewedAtMs: sameInstant,
          );

      final ReviewEvent a =
          make('00000000-0000-7000-8000-000000000001', Rating.again, 'phone');
      final ReviewEvent b =
          make('00000000-0000-7000-8000-000000000002', Rating.easy, 'tablet');

      expect(engine.fold(<ReviewEvent>[a, b]),
          engine.fold(<ReviewEvent>[b, a]));
    });
  });

  group('Pureté du moteur', () {
    test('applyReview ne mute pas l\'état passé en argument', () {
      final SrsCardState original = engine.fold(generateLog(seed: 7, count: 5));
      final SrsCardState snapshot = original.copyWith();
      engine.applyReview(original, Rating.again, t0 + 100 * kMillisPerDay);
      engine.applyReview(original, Rating.easy, t0 + 100 * kMillisPerDay);
      expect(original, snapshot);
    });

    test('fold ne modifie pas la liste d\'entrée', () {
      final List<ReviewEvent> log = generateLog(seed: 3, count: 10);
      final List<ReviewEvent> copy = List<ReviewEvent>.of(log);
      engine.fold(log);
      expect(log, copy);
    });

    test('aucune horloge implicite : le résultat ne dépend que de nowMs', () {
      final SrsCardState s = engine.applyReview(
          SrsCardState.initial, Rating.good, t0);
      final SrsCardState again = engine.applyReview(
          SrsCardState.initial, Rating.good, t0);
      expect(s, again);
    });
  });

  group('Invariants du modèle', () {
    test('la difficulté reste dans [1,10] et la stabilité positive', () {
      for (int seed = 0; seed < 200; seed++) {
        final List<ReviewEvent> log = generateLog(seed: seed, count: 40);
        SrsCardState state = SrsCardState.initial;
        for (final ReviewEvent e in log) {
          state = engine.applyReview(state, e.rating, e.reviewedAtMs,
              cardType: e.cardType);
          expect(state.difficulty,
              inInclusiveRange(kMinDifficulty, kMaxDifficulty),
              reason: 'seed=$seed');
          expect(state.stability, greaterThanOrEqualTo(kMinStability),
              reason: 'seed=$seed');
          expect(state.stability, lessThanOrEqualTo(kMaxStability));
          expect(state.scheduledDays, greaterThanOrEqualTo(0));
          expect(state.scheduledDays, lessThanOrEqualTo(36500));
        }
      }
    });

    test('reps et lapses ne décroissent jamais', () {
      for (int seed = 0; seed < 50; seed++) {
        SrsCardState state = SrsCardState.initial;
        int lastReps = 0;
        int lastLapses = 0;
        for (final ReviewEvent e in generateLog(seed: seed, count: 30)) {
          state = engine.applyReview(state, e.rating, e.reviewedAtMs,
              cardType: e.cardType);
          expect(state.reps, greaterThanOrEqualTo(lastReps));
          expect(state.lapses, greaterThanOrEqualTo(lastLapses));
          lastReps = state.reps;
          lastLapses = state.lapses;
        }
      }
    });

    test('"Again" en révision incrémente les lapses et repasse en relearning',
        () {
      SrsCardState state = SrsCardState.initial;
      int now = t0;
      for (final int gap in <int>[0, 0, 5]) {
        now += gap * kMillisPerDay;
        state = engine.applyReview(state, Rating.good, now);
      }
      expect(state.state, CardState.review);

      now += 10 * kMillisPerDay;
      final SrsCardState lapsed = engine.applyReview(state, Rating.again, now);
      expect(lapsed.state, CardState.relearning);
      expect(lapsed.lapses, state.lapses + 1);
      expect(lapsed.stability, lessThan(state.stability));
    });

    test('le seuil de leech est atteint à 8 lapses, pas avant', () {
      SrsCardState state = SrsCardState.initial;
      int now = t0;
      state = engine.applyReview(state, Rating.good, now);
      state = engine.applyReview(state, Rating.good, now);

      for (int i = 1; i <= kLeechThreshold; i++) {
        now += 3 * kMillisPerDay;
        state = engine.applyReview(state, Rating.again, now);
        expect(state.lapses, i);
        expect(state.isLeech, i >= kLeechThreshold, reason: 'lapse #$i');
        state = engine.applyReview(state, Rating.good, now);
      }
    });

    test('une révision plus tardive produit une stabilité plus grande', () {
      // Effet d'espacement : réviser au bon moment vaut mieux que trop tôt.
      SrsCardState base = SrsCardState.initial;
      int now = t0;
      for (final int gap in <int>[0, 0, 4]) {
        now += gap * kMillisPerDay;
        base = engine.applyReview(base, Rating.good, now);
      }
      final SrsCardState early =
          engine.applyReview(base, Rating.good, now + 2 * kMillisPerDay);
      final SrsCardState late =
          engine.applyReview(base, Rating.good, now + 20 * kMillisPerDay);
      expect(late.stability, greaterThan(early.stability));
    });

    test('Easy produit une stabilité supérieure à Good, elle-même > Hard', () {
      SrsCardState base = SrsCardState.initial;
      int now = t0;
      for (final int gap in <int>[0, 0, 6]) {
        now += gap * kMillisPerDay;
        base = engine.applyReview(base, Rating.good, now);
      }
      final int probe = now + 10 * kMillisPerDay;
      final double hard = engine.applyReview(base, Rating.hard, probe).stability;
      final double good = engine.applyReview(base, Rating.good, probe).stability;
      final double easy = engine.applyReview(base, Rating.easy, probe).stability;
      expect(hard, lessThan(good));
      expect(good, lessThan(easy));
    });

    test('la difficulté monte avec Again et baisse avec Easy', () {
      SrsCardState base =
          engine.applyReview(SrsCardState.initial, Rating.good, t0);
      final int probe = t0 + kMillisPerDay;
      expect(engine.applyReview(base, Rating.again, probe).difficulty,
          greaterThan(base.difficulty));
      expect(engine.applyReview(base, Rating.easy, probe).difficulty,
          lessThan(base.difficulty));
    });
  });

  group('UUID v7', () {
    test('format RFC : version 7 et variante 10xx', () {
      final UuidV7 uuid = UuidV7(random: Random(1));
      final RegExp re = RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
      for (int i = 0; i < 500; i++) {
        expect(re.hasMatch(uuid.generate(nowMs: t0 + i)), isTrue);
      }
    });

    test('l\'ordre lexicographique suit l\'ordre chronologique', () {
      final UuidV7 uuid = UuidV7(random: Random(2));
      String previous = uuid.generate(nowMs: t0);
      for (int i = 1; i <= 300; i++) {
        final String current = uuid.generate(nowMs: t0 + i * 1000);
        expect(current.compareTo(previous), greaterThan(0));
        previous = current;
      }
    });

    test('pas de collision sur 10 000 tirages au même instant', () {
      final UuidV7 uuid = UuidV7();
      final Set<String> seen = <String>{};
      for (int i = 0; i < 10000; i++) {
        expect(seen.add(uuid.generate(nowMs: t0)), isTrue);
      }
    });
  });

  group('Sérialisation ReviewEvent', () {
    test('aller-retour JSON sans perte', () {
      for (final ReviewEvent e in generateLog(seed: 11, count: 25,
          withExamMode: true)) {
        final ReviewEvent back = ReviewEvent.fromJson(e.toJson());
        expect(back.id, e.id);
        expect(back.cardId, e.cardId);
        expect(back.userId, e.userId);
        expect(back.deviceId, e.deviceId);
        expect(back.rating, e.rating);
        expect(back.reviewedAtMs, e.reviewedAtMs);
        expect(back.durationMs, e.durationMs);
        expect(back.cardType, e.cardType);
        expect(back.examMode, e.examMode);
      }
    });

    test('les valeurs numériques du protocole sont figées', () {
      // Ces constantes voyagent sur le réseau et sont persistées : les changer
      // casserait la compatibilité avec les journaux déjà écrits.
      expect(Rating.again.value, 1);
      expect(Rating.hard.value, 2);
      expect(Rating.good.value, 3);
      expect(Rating.easy.value, 4);
      expect(CardState.newCard.wire, 'new');
      expect(CardState.learning.wire, 'learning');
      expect(CardState.review.wire, 'review');
      expect(CardState.relearning.wire, 'relearning');
      expect(CardType.basic.wire, 'basic');
      expect(CardType.cloze.wire, 'cloze');
      expect(CardType.qcm.wire, 'qcm');
    });

    test('une note hors bornes est rejetée', () {
      expect(() => Rating.fromValue(0), throwsArgumentError);
      expect(() => Rating.fromValue(5), throwsArgumentError);
    });
  });
}
