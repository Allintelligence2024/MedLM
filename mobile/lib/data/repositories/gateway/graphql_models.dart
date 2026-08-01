// Modèles de réponse du gateway GraphQL v2 (Phase 20.2).
//
// Miroir des `shape()` de backend/src/gateway/persisted-operations.ts :
// ce sont les projections camelCase des payloads REST /v1 — PAS les
// DTOs REST (d'où des classes dédiées ici, sans recycler celles de
// data/repositories/ai).
library;

/// ViewerStats — projection de GET /v1/stats/me.
class GqlViewerStats {
  const GqlViewerStats({
    required this.period,
    required this.cardsReviewed,
    required this.accuracy,
    required this.currentStreak,
    required this.xpTotal,
    required this.level,
    required this.leechCount,
  });

  final String period;
  final int cardsReviewed;
  final double accuracy;
  final int currentStreak;
  final int xpTotal;
  final int level;
  final int leechCount;

  factory GqlViewerStats.fromJson(Map<String, dynamic> j) {
    return GqlViewerStats(
      period: (j['period'] as String?) ?? 'all',
      cardsReviewed: ((j['cardsReviewed'] as num?) ?? 0).toInt(),
      accuracy: ((j['accuracy'] as num?) ?? 0).toDouble(),
      currentStreak: ((j['currentStreak'] as num?) ?? 0).toInt(),
      xpTotal: ((j['xpTotal'] as num?) ?? 0).toInt(),
      level: ((j['level'] as num?) ?? 0).toInt(),
      leechCount: ((j['leechCount'] as num?) ?? 0).toInt(),
    );
  }
}

/// Une entrée du DeckCatalog — projection de GET /v1/content/decks.
class GqlDeckEntry {
  const GqlDeckEntry({
    required this.deckId,
    required this.nameFr,
    required this.isPremium,
    required this.updatedAt,
  });

  final String deckId;
  final String nameFr;
  final bool isPremium;
  final String updatedAt;

  factory GqlDeckEntry.fromJson(Map<String, dynamic> j) {
    return GqlDeckEntry(
      deckId: (j['deckId'] as String?) ?? '',
      nameFr: (j['nameFr'] as String?) ?? '',
      isPremium: (j['isPremium'] as bool?) ?? false,
      updatedAt: (j['updatedAt'] as String?) ?? '',
    );
  }
}

/// AdaptiveProfile — projection de GET /v1/ai/adaptive/profile.
///
/// Note : le gateway expose l'ajustement SANS les poids (les 19 poids
/// complets restent une affaire de l'endpoint REST dédié et du moteur
/// local) — ici seulement l'explicabilité (actif, indices, raisons).
class GqlAdaptiveProfile {
  const GqlAdaptiveProfile({
    required this.windowDays,
    required this.totalReviews,
    required this.lapseRate,
    required this.adjustmentActive,
    required this.changedIndices,
    required this.reasons,
  });

  final int windowDays;
  final int totalReviews;
  final double lapseRate;
  final bool adjustmentActive;
  final List<int> changedIndices;
  final List<String> reasons;

  factory GqlAdaptiveProfile.fromJson(Map<String, dynamic> j) {
    final adj = Map<String, dynamic>.from(
      (j['fsrsAdjustment'] as Map?) ?? const {},
    );
    return GqlAdaptiveProfile(
      windowDays: ((j['windowDays'] as num?) ?? 30).toInt(),
      totalReviews: ((j['totalReviews'] as num?) ?? 0).toInt(),
      lapseRate: ((j['lapseRate'] as num?) ?? 0).toDouble(),
      adjustmentActive: (adj['active'] as bool?) ?? false,
      changedIndices: ((adj['changedIndices'] as List?) ?? const [])
          .map((e) => (e as num).toInt())
          .toList(),
      reasons: ((adj['reasons'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

/// Un template d'examen blanc — projection de GET /v1/exams/templates.
class GqlExamTemplate {
  const GqlExamTemplate({required this.id, required this.title});

  final String id;
  final String title;

  factory GqlExamTemplate.fromJson(Map<String, dynamic> j) {
    return GqlExamTemplate(
      id: (j['id'] as String?) ?? '',
      title: (j['title'] as String?) ?? '',
    );
  }
}

/// LeaderboardTop — projection de GET /v1/gamification/leaderboard.
class GqlLeaderboardEntry {
  const GqlLeaderboardEntry({
    required this.pseudonym,
    required this.xpTotal,
    required this.rank,
  });

  final String pseudonym;
  final int xpTotal;
  final int rank;

  factory GqlLeaderboardEntry.fromJson(Map<String, dynamic> j) {
    return GqlLeaderboardEntry(
      pseudonym: (j['pseudonym'] as String?) ?? '',
      xpTotal: ((j['xpTotal'] as num?) ?? 0).toInt(),
      rank: ((j['rank'] as num?) ?? 0).toInt(),
    );
  }
}

class GqlLeaderboard {
  const GqlLeaderboard({required this.entries, this.week});

  final List<GqlLeaderboardEntry> entries;

  /// Semaine servie (peut être null sur le payload de la shape).
  final String? week;

  factory GqlLeaderboard.fromJson(Map<String, dynamic> j) {
    return GqlLeaderboard(
      week: j['week'] as String?,
      entries: ((j['entries'] as List?) ?? const [])
          .map((e) =>
              GqlLeaderboardEntry.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }
}
