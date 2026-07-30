// XpCalculator — moteur pur qui transforme des actions en XP.
//
// Règles (v2 §9.1) :
//   * XP sur l'HABITUDE, pas sur la note.
//   * PAS de bonus "Easy".
//   * Plafond dur 100 cartes/jour.
//   * Multiplicateur streak après 7j et 30j.
//   * Note = 0 (Again) ne donne PAS moins d'XP — c'est l'effort qui
//     compte, pas la performance.
library;

import 'gamification_constants.dart';

class XpEvent {
  const XpEvent({
    required this.kind,
    required this.count,
    required this.dayKey,
  });
  final XpEventKind kind;
  final int count; // nombre de cartes, QCM, sessions…
  final String dayKey; // YYYY-MM-DD en heure locale
}

enum XpEventKind { cardReviewed, qcmAnswered, sessionComplete, mockExamComplete }

class XpAward {
  const XpAward({required this.baseXp, required this.multiplier, required this.totalXp});
  final int baseXp;
  final double multiplier;
  final int totalXp;

  @override
  String toString() => 'XpAward($totalXp = $baseXp × $multiplier)';
}

class XpCalculator {
  const XpCalculator();

  XpAward compute({
    required XpEvent event,
    required int streakDays,
    required int cardsAlreadyCountedToday,
  }) {
    // Plafond anti-burnout : on plafonne le nombre de cartes prises
    // en compte pour l'XP aujourd'hui.
    final int remaining = GamificationConstants.maxCardsPerDayForXp -
        cardsAlreadyCountedToday;
    if (remaining <= 0) {
      return const XpAward(baseXp: 0, multiplier: 1.0, totalXp: 0);
    }
    final int effectiveCount =
        event.count > remaining ? remaining : event.count;

    int base = 0;
    switch (event.kind) {
      case XpEventKind.cardReviewed:
        base = effectiveCount * GamificationConstants.xpCardReviewed;
        break;
      case XpEventKind.qcmAnswered:
        base = effectiveCount * GamificationConstants.xpQcmAnswered;
        break;
      case XpEventKind.sessionComplete:
        // Une seule session par jour compte (au-delà : 0 XP).
        base = effectiveCount > 0
            ? GamificationConstants.xpSessionComplete
            : 0;
        break;
      case XpEventKind.mockExamComplete:
        base = effectiveCount > 0
            ? GamificationConstants.xpMockExamComplete
            : 0;
        break;
    }

    final double mult = _multiplierForStreak(streakDays);
    return XpAward(
      baseXp: base,
      multiplier: mult,
      totalXp: (base * mult).round(),
    );
  }

  double _multiplierForStreak(int days) {
    if (days >= GamificationConstants.streakMultiplierThreshold30) {
      return GamificationConstants.streakMultiplier30;
    }
    if (days >= GamificationConstants.streakMultiplierThreshold7) {
      return GamificationConstants.streakMultiplier7;
    }
    return 1.0;
  }
}
