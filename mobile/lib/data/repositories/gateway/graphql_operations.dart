// Opérations GraphQL persistées — Phase 20.2 (client mobile).
//
// Le gateway N'ACCEPTE AUCUNE REQUÊTE ARBITRAIRE : le texte normalisé
// de `query` doit correspondre à l'empreinte d'une opération déclarée
// dans backend/src/gateway/persisted-operations.ts (modèle « trusted
// documents »). Les chaînes ci-dessous en sont donc des COPIES
// EXACTES, verrouillées par tools/scripts/check_graphql.py (parité
// mobile ↔ backend) — toute dérive = rejet 400 OPERATION_NOT_PERSISTED
// côté serveur + échec du garde en CI.
//
// v1 = lecture seule. Le coût de chaque opération est rappelé en
// commentaire (budget 500/h/user côté serveur).
library;

abstract final class GraphqlOperations {
  /// Coût 10 — GET /stats/me.
  static const String viewerStats =
      'query ViewerStats(\$period: StatsPeriod) { viewerStats(period: \$period) { period cardsReviewed accuracy currentStreak xpTotal level leechCount } }';

  /// Coût 5 — GET /content/decks.
  static const String deckCatalog =
      'query DeckCatalog { deckCatalog { deckId nameFr isPremium updatedAt } }';

  /// Coût 15 — GET /ai/adaptive/profile.
  static const String adaptiveProfile =
      'query AdaptiveProfile { adaptiveProfile { windowDays totalReviews lapseRate fsrsAdjustment { active changedIndices reasons } } }';

  /// Coût 8 — GET /exams/templates.
  static const String mockExamTemplates =
      'query MockExamTemplates(\$faculty: String, \$studyYear: Int) { mockExamTemplates(faculty: \$faculty, studyYear: \$studyYear) { id title } }';

  /// Coût 6 — GET /gamification/leaderboard.
  static const String leaderboardTop =
      'query LeaderboardTop(\$faculty: String, \$studyYear: Int, \$limit: Int) { leaderboardTop(faculty: \$faculty, studyYear: \$studyYear, limit: \$limit) { entries { pseudonym xpTotal rank } week } }';

  /// Toutes les SDL clients — sert au garde de parité ET aux tests.
  static const List<String> all = [
    viewerStats,
    deckCatalog,
    adaptiveProfile,
    mockExamTemplates,
    leaderboardTop,
  ];
}
