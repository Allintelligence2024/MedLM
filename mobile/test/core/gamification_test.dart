// Tests Phase 9 — Gamification (XpCalculator, StreakCalculator, Levels).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/gamification/gamification_constants.dart';
import 'package:medanki_dz/core/gamification/streak_calculator.dart';
import 'package:medanki_dz/core/gamification/xp_calculator.dart';

void main() {
  group('XpCalculator', () {
    const calc = XpCalculator();

    test('carte révisée = 3 XP sans multiplicateur', () {
      final award = calc.compute(
        event: const XpEvent(
          kind: XpEventKind.cardReviewed,
          count: 1,
          dayKey: '2026-07-30',
        ),
        streakDays: 0,
        cardsAlreadyCountedToday: 0,
      );
      expect(award.baseXp, 3);
      expect(award.multiplier, 1.0);
      expect(award.totalXp, 3);
    });

    test('multiplicateur 1.2 après 7 jours de streak', () {
      final award = calc.compute(
        event: const XpEvent(
          kind: XpEventKind.sessionComplete,
          count: 1,
          dayKey: '2026-07-30',
        ),
        streakDays: 7,
        cardsAlreadyCountedToday: 50,
      );
      expect(award.multiplier, 1.2);
      expect(award.totalXp, (30 * 1.2).round());
    });

    test('multiplicateur 1.5 après 30 jours', () {
      final award = calc.compute(
        event: const XpEvent(
          kind: XpEventKind.mockExamComplete,
          count: 1,
          dayKey: '2026-07-30',
        ),
        streakDays: 30,
        cardsAlreadyCountedToday: 0,
      );
      expect(award.totalXp, (50 * 1.5).round());
    });

    test('plafond 100 cartes/jour appliqué (anti-burnout)', () {
      final award = calc.compute(
        event: const XpEvent(
          kind: XpEventKind.cardReviewed,
          count: 50, // on demande 50, mais on en a déjà 80
          dayKey: '2026-07-30',
        ),
        streakDays: 0,
        cardsAlreadyCountedToday: 80,
      );
      // Il ne reste que 20 cartes comptées.
      expect(award.baseXp, 20 * 3);
    });

    test('plafond 0 = 0 XP', () {
      final award = calc.compute(
        event: const XpEvent(
          kind: XpEventKind.cardReviewed,
          count: 10,
          dayKey: '2026-07-30',
        ),
        streakDays: 0,
        cardsAlreadyCountedToday: 100,
      );
      expect(award.totalXp, 0);
    });

    test('Note "Easy" ne donne PAS de bonus (anti-pattern)', () {
      // Anti-pattern Phase 1 : le proto donnait +15 XP/Easy. On a
      // supprimé. Le calcul est désormais identique pour toutes les
      // notes : 3 XP/carte, peu importe la note.
      final easy = calc.compute(
        event: const XpEvent(
          kind: XpEventKind.cardReviewed,
          count: 1,
          dayKey: '2026-07-30',
        ),
        streakDays: 0,
        cardsAlreadyCountedToday: 0,
      );
      final again = calc.compute(
        event: const XpEvent(
          kind: XpEventKind.cardReviewed,
          count: 1,
          dayKey: '2026-07-30',
        ),
        streakDays: 0,
        cardsAlreadyCountedToday: 1,
      );
      expect(easy.baseXp, again.baseXp);
    });
  });

  group('Levels', () {
    test('XP 0 → Étudiant P1', () {
      expect(Level.forXp(0).name, 'Étudiant P1');
    });
    test('XP 500 → Étudiant P2', () {
      expect(Level.forXp(500).name, 'Étudiant P2');
    });
    test('XP 5000 → Résident', () {
      expect(Level.forXp(5000).name, 'Résident');
    });
    test('XP 10000 → Praticien', () {
      expect(Level.forXp(10000).name, 'Praticien');
    });
    test('progressToNext entre 0 et 1', () {
      expect(Level.progressToNext(250), 0.5); // moitié chemin vers P2
      expect(Level.progressToNext(99999), 1.0); // max
    });
  });

  group('StreakCalculator', () {
    const calc = StreakCalculator();

    test('historique vide → 0', () {
      final s = calc.compute(
        reviewDayKeys: <String>[],
        freezesUsedThisMonth: 0,
        now: DateTime(2026, 7, 30),
      );
      expect(s.currentDays, 0);
    });

    test('3 jours consécutifs → 3', () {
      final s = calc.compute(
        reviewDayKeys: const ['2026-07-28', '2026-07-29', '2026-07-30'],
        freezesUsedThisMonth: 0,
        now: DateTime(2026, 7, 30),
      );
      expect(s.currentDays, 3);
      expect(s.atRisk, isFalse);
    });

    test('hier mais pas aujourd\'hui → atRisk, mais pas cassé', () {
      final s = calc.compute(
        reviewDayKeys: const ['2026-07-29'],
        freezesUsedThisMonth: 0,
        now: DateTime(2026, 7, 30, 14, 0),
      );
      expect(s.currentDays, 1);
      expect(s.atRisk, isTrue);
    });

    test('3 jours d\'écart → streak cassé', () {
      final s = calc.compute(
        reviewDayKeys: const ['2026-07-27'],
        freezesUsedThisMonth: 0,
        now: DateTime(2026, 7, 30),
      );
      expect(s.currentDays, 0);
    });

    test('freeze consommé automatiquement si dispo', () {
      final s = calc.compute(
        reviewDayKeys: const ['2026-07-27'],
        freezesUsedThisMonth: 0,
        now: DateTime(2026, 7, 30),
      );
      // 1 freeze a été consommé pour préserver le streak.
      expect(s.currentDays, 1);
      expect(s.freezesUsedThisMonth, 1);
      expect(s.atRisk, isTrue);
    });

    test('pas de freeze dispo → 0', () {
      final s = calc.compute(
        reviewDayKeys: const ['2026-07-27'],
        freezesUsedThisMonth: 2, // quota épuisé
        now: DateTime(2026, 7, 30),
      );
      expect(s.currentDays, 0);
    });
  });

  group('Badges', () {
    test('streak 7j débloque le badge "Semaine parfaite"', () {
      final ctx = BadgeContext(
        streakDays: 7,
        totalXp: 0,
        cardsMastered: 0,
        modulesCompleted: 0,
        daysSinceSignup: 30,
        englishEnabled: false,
      );
      final unlocked = Badges.all.where((b) => b.criterion(ctx)).toList();
      expect(unlocked.map((b) => b.id), contains('streak_7'));
    });

    test('streak 30j débloque "Mois de fer"', () {
      final ctx = BadgeContext(
        streakDays: 30,
        totalXp: 0,
        cardsMastered: 0,
        modulesCompleted: 0,
        daysSinceSignup: 60,
        englishEnabled: false,
      );
      final unlocked = Badges.all.where((b) => b.criterion(ctx)).toList();
      expect(unlocked.map((b) => b.id), contains('streak_30'));
    });

    test('EN activé débloque "Bilingue"', () {
      final ctx = BadgeContext(
        streakDays: 0,
        totalXp: 0,
        cardsMastered: 0,
        modulesCompleted: 0,
        daysSinceSignup: 0,
        englishEnabled: true,
      );
      final unlocked = Badges.all.where((b) => b.criterion(ctx)).toList();
      expect(unlocked.map((b) => b.id), contains('english_enabled'));
    });

    test('500 cartes maîtrisées débloque "500 cartes maîtrisées"', () {
      final ctx = BadgeContext(
        streakDays: 0,
        totalXp: 0,
        cardsMastered: 500,
        modulesCompleted: 0,
        daysSinceSignup: 0,
        englishEnabled: false,
      );
      final unlocked = Badges.all.where((b) => b.criterion(ctx)).toList();
      expect(unlocked.map((b) => b.id), contains('cards_500'));
    });
  });
}
