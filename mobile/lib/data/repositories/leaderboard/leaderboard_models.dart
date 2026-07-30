// Modèles Leaderboard (côté mobile, Phase 9 bis).
//
// Réplique des DTOs backend `leaderboard.dto.ts`. Mêmes noms de
// champs, mêmes contraintes (snake_case pour rester iso avec la
// réponse JSON du backend).
library;

class LeaderboardEntry {
  LeaderboardEntry({
    required this.rank,
    required this.pseudonym,
    required this.faculty,
    required this.studyYear,
    required this.xpWeek,
    required this.cardsReviewed,
    required this.mockExams,
  });

  final int rank;
  final String pseudonym;
  final String? faculty;
  final int? studyYear;
  final int xpWeek;
  final int cardsReviewed;
  final int mockExams;

  factory LeaderboardEntry.fromJson(Map<String, dynamic> j) {
    return LeaderboardEntry(
      rank: (j['rank'] as num).toInt(),
      pseudonym: j['pseudonym'] as String,
      faculty: j['faculty'] as String?,
      studyYear: (j['study_year'] as num?)?.toInt(),
      xpWeek: (j['xp_week'] as num).toInt(),
      cardsReviewed: (j['cards_reviewed'] as num).toInt(),
      mockExams: (j['mock_exams'] as num).toInt(),
    );
  }
}

class LeaderboardSnapshot {
  LeaderboardSnapshot({
    required this.weekIso,
    required this.totalEntries,
    required this.entries,
    required this.myRank,
  });

  final String weekIso;
  final int totalEntries;
  final List<LeaderboardEntry> entries;
  final int? myRank;

  factory LeaderboardSnapshot.fromJson(Map<String, dynamic> j) {
    final raw = (j['entries'] as List).cast<Map<String, dynamic>>();
    return LeaderboardSnapshot(
      weekIso: j['week_iso'] as String,
      totalEntries: (j['total_entries'] as num).toInt(),
      entries: raw.map(LeaderboardEntry.fromJson).toList(),
      myRank: (j['my_rank'] as num?)?.toInt(),
    );
  }

  LeaderboardSnapshot copyWith({int? totalEntries, List<LeaderboardEntry>? entries, int? myRank}) =>
      LeaderboardSnapshot(
        weekIso: weekIso,
        totalEntries: totalEntries ?? this.totalEntries,
        entries: entries ?? this.entries,
        myRank: myRank ?? this.myRank,
      );
}
