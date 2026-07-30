// Modèles Stats (côté mobile, Phase 15.2).
//
// Réplique des DTOs backend `stats.dto.ts`. On garde les noms en
// snake_case pour rester iso avec la réponse JSON.

class UserStats {
  const UserStats({
    required this.userId,
    required this.period,
    required this.cardsReviewed,
    required this.cardsCorrect,
    required this.accuracy,
    required this.totalDurationMs,
    required this.avgDurationMs,
    required this.sessionsCount,
    required this.mockExamsCount,
    required this.mockExamsAvgScore,
    required this.currentStreak,
    required this.longestStreak,
    required this.xpTotal,
    required this.level,
    required this.cardsByState,
    required this.topDecks,
    required this.leechCount,
    required this.ratingDistribution,
    required this.forecastNextReviewDays,
    required this.computedAt,
  });

  final String userId;
  final String period;
  final int cardsReviewed;
  final int cardsCorrect;
  final double accuracy;
  final int totalDurationMs;
  final int avgDurationMs;
  final int sessionsCount;
  final int mockExamsCount;
  final double mockExamsAvgScore;
  final int currentStreak;
  final int longestStreak;
  final int xpTotal;
  final String level;
  final Map<String, int> cardsByState;
  final List<TopDeck> topDecks;
  final int leechCount;
  final Map<String, int> ratingDistribution;
  final int forecastNextReviewDays;
  final String computedAt;

  factory UserStats.fromJson(Map<String, dynamic> j) {
    return UserStats(
      userId: j['user_id'] as String,
      period: j['period'] as String,
      cardsReviewed: (j['cards_reviewed'] as num).toInt(),
      cardsCorrect: (j['cards_correct'] as num).toInt(),
      accuracy: (j['accuracy'] as num).toDouble(),
      totalDurationMs: (j['total_duration_ms'] as num).toInt(),
      avgDurationMs: (j['avg_duration_ms'] as num).toInt(),
      sessionsCount: (j['sessions_count'] as num).toInt(),
      mockExamsCount: (j['mock_exams_count'] as num).toInt(),
      mockExamsAvgScore: (j['mock_exams_avg_score'] as num).toDouble(),
      currentStreak: (j['current_streak'] as num).toInt(),
      longestStreak: (j['longest_streak'] as num).toInt(),
      xpTotal: (j['xp_total'] as num).toInt(),
      level: j['level'] as String,
      cardsByState: (j['cards_by_state'] as Map).cast<String, int>(),
      topDecks: (j['top_decks'] as List)
          .cast<Map<String, dynamic>>()
          .map(TopDeck.fromJson)
          .toList(),
      leechCount: (j['leech_count'] as num).toInt(),
      ratingDistribution: (j['rating_distribution'] as Map).cast<String, int>(),
      forecastNextReviewDays: (j['forecast_next_review_days'] as num).toInt(),
      computedAt: j['computed_at'] as String,
    );
  }
}

class TopDeck {
  const TopDeck({
    required this.deckId,
    required this.deckName,
    required this.cards,
  });
  final String deckId;
  final String deckName;
  final int cards;

  factory TopDeck.fromJson(Map<String, dynamic> j) => TopDeck(
    deckId: j['deck_id'] as String,
    deckName: j['deck_name'] as String,
    cards: (j['cards'] as num).toInt(),
  );
}
