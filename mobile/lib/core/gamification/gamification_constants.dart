// Constantes de gamification (architecture v2 §9).
//
// Règles non négociables :
//   * XP sur l'HABITUDE (session complétée), pas sur la note.
//   * PAS de bonus sur "Easy" (anti-pattern explicite de la v2).
//   * Plafond dur 100 cartes/jour pour l'XP (anti-burnout).
//   * Streak = 1 session/jour avec au moins 10 cartes dues révisées.

class GamificationConstants {
  GamificationConstants._();

  // XP rewards (par session, JAMAIS par note).
  static const int xpSessionComplete = 30;
  static const int xpCardReviewed = 3; // toutes notes confondues
  static const int xpQcmAnswered = 4;
  static const int xpMockExamComplete = 50;

  // Multiplicateurs streak.
  static const double streakMultiplier7 = 1.2; // après 7 jours
  static const double streakMultiplier30 = 1.5; // après 30 jours
  static const int streakMultiplierThreshold7 = 7;
  static const int streakMultiplierThreshold30 = 30;

  // Plafond anti-burnout.
  static const int maxCardsPerDayForXp = 100;

  // Streak.
  static const int minCardsPerDayForStreak = 10;
  static const int maxFreezesPerMonth = 2;
  static const int streakGraceHours = 36; // tolérance fuseau/heure tardive
}

/// Niveaux (v2 §9.2).
class Level {
  const Level(this.name, this.minXp, this.color);
  final String name;
  final int minXp;
  final int color; // ARGB

  static const List<Level> tiers = <Level>[
    Level('Étudiant P1', 0, 0xFF607D8B),
    Level('Étudiant P2', 500, 0xFF1976D2),
    Level('Interne', 2000, 0xFF388E3C),
    Level('Résident', 5000, 0xFF7B1FA2),
    Level('Praticien', 10000, 0xFFFF8F00),
  ];

  static Level forXp(int xp) {
    Level current = tiers.first;
    for (final Level t in tiers) {
      if (xp >= t.minXp) current = t;
    }
    return current;
  }

  /// Progression vers le prochain niveau (0.0 → 1.0).
  static double progressToNext(int xp) {
    final Level current = forXp(xp);
    final int idx = tiers.indexOf(current);
    if (idx == tiers.length - 1) return 1.0;
    final Level next = tiers[idx + 1];
    final int span = next.minXp - current.minXp;
    return ((xp - current.minXp) / span).clamp(0.0, 1.0);
  }
}

/// Badges (v2 §9.4) — jalons pédagogiques, pas cosmétiques.
class Badge {
  const Badge({
    required this.id,
    required this.name,
    required this.description,
    required this.iconCode,
    required this.criterion,
  });
  final String id;
  final String name;
  final String description;
  final String iconCode; // emoji ou code SF Symbol
  final bool Function(BadgeContext) criterion;
}

/// Contexte passé à la fonction de critère d'un badge.
class BadgeContext {
  const BadgeContext({
    required this.streakDays,
    required this.totalXp,
    required this.cardsMastered,
    required this.modulesCompleted,
    required this.daysSinceSignup,
    required this.englishEnabled,
  });
  final int streakDays;
  final int totalXp;
  final int cardsMastered; // cartes avec reps >= 5 et lapses < 3
  final int modulesCompleted; // modules où 100% des cartes sont en REVIEW
  final int daysSinceSignup;
  final bool englishEnabled;
}

class Badges {
  Badges._();

  static final List<Badge> all = <Badge>[
    Badge(
      id: 'streak_7',
      name: 'Semaine parfaite',
      description: '7 jours de streak',
      iconCode: '🔥',
      criterion: (c) => c.streakDays >= 7,
    ),
    Badge(
      id: 'streak_30',
      name: 'Mois de fer',
      description: '30 jours de streak',
      iconCode: '🔥',
      criterion: (c) => c.streakDays >= 30,
    ),
    Badge(
      id: 'streak_100',
      name: 'Centenaire',
      description: '100 jours de streak',
      iconCode: '🔥',
      criterion: (c) => c.streakDays >= 100,
    ),
    Badge(
      id: 'module_complete',
      name: 'Module complété',
      description: 'Toutes les cartes d\'un module sont en révision',
      iconCode: '🧠',
      criterion: (c) => c.modulesCompleted >= 1,
    ),
    Badge(
      id: 'mock_80',
      name: 'As du mock exam',
      description: 'Mock exam à plus de 80% (sera tracked en Phase 10)',
      iconCode: '💯',
      criterion: (_) => false, // Phase 10 : brancher sur ExamAttempt
    ),
    Badge(
      id: 'cards_500',
      name: '500 cartes maîtrisées',
      description: '500 cartes avec reps >= 5 et lapses < 3',
      iconCode: '📚',
      criterion: (c) => c.cardsMastered >= 500,
    ),
    Badge(
      id: 'cards_2500',
      name: '2 500 cartes maîtrisées',
      description: '2 500 cartes maîtrisées',
      iconCode: '📚',
      criterion: (c) => c.cardsMastered >= 2500,
    ),
    Badge(
      id: 'zero_due_7d',
      name: 'Zéro carte due',
      description: '7 jours consécutifs sans carte due en retard',
      iconCode: '🔄',
      criterion: (c) => c.daysSinceSignup >= 7 && c.cardsMastered > 0,
      // Version simplifiée Phase 9 : déclenché après 7j si cartes maîtrisées.
    ),
    Badge(
      id: 'english_enabled',
      name: 'Bilingue',
      description: 'Terme médical EN activé en plus du français',
      iconCode: '🌍',
      criterion: (c) => c.englishEnabled,
    ),
  ];
}
