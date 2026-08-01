// Modèles ML locaux (Phase 20.3) — miroir des réponses backend
// (`score-predictor.ts`, `tag-adjustments.ts`).
//
// Deux endpoints, lecture seule, 100 % calculés côté serveur sur des
// agrégats déjà en base (jamais de service ML externe) :
//   * GET /v1/ml/mock-exam-prediction — prédiction EXPLICABLE du score
//     au prochain examen blanc, ou refus k-anonymat documenté ;
//   * GET /v1/ml/tag-focus — suggestions focus/relax par tag, chacune
//     rendant ses chiffres (v2 §13 — explicabilité).
//
// On garde les noms snake_case pour rester iso avec le JSON servi.
library;

// ── Prédiction d'examen blanc ──────────────────────────────────────

/// Bande d'interprétation documentée (`SCORE_THRESHOLDS` côté backend).
enum ScoreBand {
  low('low'),
  medium('medium'),
  high('high');

  const ScoreBand(this.wire);
  final String wire;

  static ScoreBand? fromWire(String? value) {
    for (final b in ScoreBand.values) {
      if (b.wire == value) return b;
    }
    return null;
  }
}

/// Features de la prédiction — TOUJOURS rendues (explicabilité :
/// l'utilisateur voit exactement sur quoi repose le chiffre).
class ScoreFeatures {
  const ScoreFeatures({
    required this.reviews30d,
    required this.accuracy30d,
    required this.coverageRatio,
    required this.matureRatio,
    required this.streakDays,
  });

  final int reviews30d;
  final double accuracy30d;
  final double coverageRatio;
  final double matureRatio;
  final int streakDays;

  factory ScoreFeatures.fromJson(Map<String, dynamic> j) {
    return ScoreFeatures(
      reviews30d: ((j['reviews30d'] as num?) ?? 0).toInt(),
      accuracy30d: ((j['accuracy30d'] as num?) ?? 0).toDouble(),
      coverageRatio: ((j['coverageRatio'] as num?) ?? 0).toDouble(),
      matureRatio: ((j['matureRatio'] as num?) ?? 0).toDouble(),
      streakDays: ((j['streakDays'] as num?) ?? 0).toInt(),
    );
  }
}

/// Réponse de GET /v1/ml/mock-exam-prediction.
///
/// Deux formes (`ScorePrediction` côté backend est une union) :
///   * predictible == true  → [scorePercent], [band] et
///     [marginPercent] sont renseignés ;
///   * predictible == false → [reason] explique le refus (k-anonymat :
///     moins de 50 revues sur 30 j, statistiquement indéfendable).
class MockExamPrediction {
  const MockExamPrediction({
    required this.userId,
    required this.windowDays,
    required this.predictible,
    required this.modelVersion,
    required this.features,
    this.scorePercent,
    this.band,
    this.marginPercent,
    this.reason,
  });

  final String userId;
  final int windowDays;
  final bool predictible;

  /// Version des coefficients (gelée par changelog côté backend) —
  /// affichable pour audit, jamais interprétée côté client.
  final String modelVersion;
  final ScoreFeatures features;

  /// Score prédit en % (0..100, pas 0.1) — null si !predictible.
  final double? scorePercent;
  final ScoreBand? band;

  /// Marge approximative en points de % — null si !predictible.
  final double? marginPercent;

  /// Raison du refus (déjà localisée côté backend) — null si predictible.
  final String? reason;

  factory MockExamPrediction.fromJson(Map<String, dynamic> j) {
    return MockExamPrediction(
      userId: (j['user_id'] as String?) ?? '',
      windowDays: ((j['window_days'] as num?) ?? 30).toInt(),
      predictible: (j['predictible'] as bool?) ?? false,
      modelVersion: (j['modelVersion'] as String?) ?? 'unknown',
      features: ScoreFeatures.fromJson(
        Map<String, dynamic>.from((j['features'] as Map?) ?? const {}),
      ),
      scorePercent: (j['scorePercent'] as num?)?.toDouble(),
      band: ScoreBand.fromWire(j['band'] as String?),
      marginPercent: (j['marginPercent'] as num?)?.toDouble(),
      reason: j['reason'] as String?,
    );
  }
}

// ── Focus par tag ──────────────────────────────────────────────────

enum TagSuggestionKind {
  focus('focus'),
  relax('relax');

  const TagSuggestionKind(this.wire);
  final String wire;

  static TagSuggestionKind fromWire(String? value) {
    return value == 'relax' ? TagSuggestionKind.relax : TagSuggestionKind.focus;
  }
}

/// Une suggestion par tag — chacune rend ses chiffres + une [reason]
/// explicable (même pattern que l'adaptatif 18.4).
class TagSuggestion {
  const TagSuggestion({
    required this.tag,
    required this.kind,
    required this.reviews,
    required this.lapses,
    required this.lapseRate,
    required this.reason,
  });

  final String tag;
  final TagSuggestionKind kind;
  final int reviews;
  final int lapses;

  /// Taux d'échec arrondi au millième (0..1).
  final double lapseRate;

  /// Justification explicable (déjà localisée côté backend).
  final String reason;

  factory TagSuggestion.fromJson(Map<String, dynamic> j) {
    return TagSuggestion(
      tag: (j['tag'] as String?) ?? '',
      kind: TagSuggestionKind.fromWire(j['kind'] as String?),
      reviews: ((j['reviews'] as num?) ?? 0).toInt(),
      lapses: ((j['lapses'] as num?) ?? 0).toInt(),
      lapseRate: ((j['lapseRate'] as num?) ?? 0).toDouble(),
      reason: (j['reason'] as String?) ?? '',
    );
  }
}

/// Réponse de GET /v1/ml/tag-focus (cap 5 par catégorie côté serveur).
class TagFocusResult {
  const TagFocusResult({
    required this.userId,
    required this.windowDays,
    required this.focus,
    required this.relax,
  });

  final String userId;
  final int windowDays;
  final List<TagSuggestion> focus;
  final List<TagSuggestion> relax;

  factory TagFocusResult.fromJson(Map<String, dynamic> j) {
    return TagFocusResult(
      userId: (j['user_id'] as String?) ?? '',
      windowDays: ((j['window_days'] as num?) ?? 30).toInt(),
      focus: ((j['focus'] as List?) ?? const [])
          .map((e) => TagSuggestion.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      relax: ((j['relax'] as List?) ?? const [])
          .map((e) => TagSuggestion.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }
}
