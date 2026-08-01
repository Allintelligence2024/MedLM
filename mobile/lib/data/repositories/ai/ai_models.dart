// Modèles IA (côté mobile, Phase 19.5).
//
// Réplique des DTOs backend Phase 18 (`hints.dto.ts`,
// `voice-to-card.dto.ts`, `tutor.dto.ts`, `adaptive.service.ts`).
// On garde les noms en snake_case pour rester iso avec le JSON servi.
library;

/// Trois langues supportées (v2 §3.2) — fr principal, ar/en alignés.
enum AiLang {
  fr('fr'),
  ar('ar'),
  en('en');

  const AiLang(this.wire);
  final String wire;

  static AiLang fromWire(String? value) {
    switch (value) {
      case 'ar':
        return AiLang.ar;
      case 'en':
        return AiLang.en;
      default:
        return AiLang.fr;
    }
  }
}

// ── Hints (GET /v1/ai/hints/:cardId — Phase 18.1) ──────────────────

/// Catégories de hints — miroir de `hint-templates.ts`.
enum HintCategory {
  leechHelp('leech_help'),
  firstEncounter('first_encounter'),
  consolidation('consolidation'),
  examLink('exam_link'),
  difficultyHigh('difficulty_high'),
  duePressure('due_pressure'),
  memoryAnchor('memory_anchor');

  const HintCategory(this.wire);
  final String wire;

  static HintCategory fromWire(String? value) {
    for (final c in HintCategory.values) {
      if (c.wire == value) return c;
    }
    return HintCategory.memoryAnchor;
  }
}

enum ExperienceLevel {
  beginner('beginner'),
  intermediate('intermediate'),
  advanced('advanced');

  const ExperienceLevel(this.wire);
  final String wire;

  static ExperienceLevel fromWire(String? value) {
    switch (value) {
      case 'intermediate':
        return ExperienceLevel.intermediate;
      case 'advanced':
        return ExperienceLevel.advanced;
      default:
        return ExperienceLevel.beginner;
    }
  }
}

class AiHint {
  const AiHint({
    required this.cardId,
    required this.category,
    required this.text,
    required this.lang,
    required this.experienceLevel,
    required this.personalized,
    required this.basedOn,
    required this.generatedAt,
  });

  final String cardId;
  final HintCategory category;

  /// Texte du hint, déjà localisé par le serveur.
  final String text;
  final AiLang lang;
  final ExperienceLevel experienceLevel;
  final bool personalized;

  /// Justification explicable (v2 §13) — signaux utilisés.
  final List<String> basedOn;
  final String generatedAt;

  factory AiHint.fromJson(Map<String, dynamic> j) {
    return AiHint(
      cardId: j['card_id'] as String,
      category: HintCategory.fromWire(j['category'] as String?),
      text: j['hint'] as String,
      lang: AiLang.fromWire(j['lang'] as String?),
      experienceLevel:
          ExperienceLevel.fromWire(j['experience_level'] as String?),
      personalized: (j['personalized'] as bool?) ?? true,
      basedOn: ((j['based_on'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      generatedAt: (j['generated_at'] as String?) ?? '',
    );
  }
}

// ── Voice-to-card (POST /v1/ai/voice-to-card — Phase 18.3) ─────────

class VoiceDraftFormatted {
  const VoiceDraftFormatted({
    required this.front,
    required this.back,
    required this.rule,
  });

  final String front;
  final String back;

  /// Règle de formatage qui a produit la carte (explicable, v2 §13).
  final String rule;

  factory VoiceDraftFormatted.fromJson(Map<String, dynamic> j) {
    return VoiceDraftFormatted(
      front: (j['front'] as String?) ?? '',
      back: (j['back'] as String?) ?? '',
      rule: (j['rule'] as String?) ?? '',
    );
  }
}

class TranscriberInfo {
  const TranscriberInfo({
    required this.provider,
    required this.model,
    required this.confidence,
  });

  final String provider;
  final String model;
  final double confidence;

  factory TranscriberInfo.fromJson(Map<String, dynamic> j) {
    return TranscriberInfo(
      provider: (j['provider'] as String?) ?? 'unknown',
      model: (j['model'] as String?) ?? 'unknown',
      confidence: ((j['confidence'] as num?) ?? 0).toDouble(),
    );
  }
}

class VoiceDraft {
  const VoiceDraft({
    required this.jobId,
    required this.draftId,
    required this.transcript,
    required this.formatted,
    required this.transcriber,
    required this.lang,
    required this.remainingQuotaToday,
    required this.nextStep,
  });

  final String jobId;
  final String draftId;
  final String transcript;
  final VoiceDraftFormatted formatted;
  final TranscriberInfo transcriber;
  final AiLang lang;

  /// Quota vocal restant aujourd'hui (50/j par défaut).
  final int remainingQuotaToday;

  /// Message de guidage (déjà localisé) — ex. « relisez puis publiez ».
  final String nextStep;

  factory VoiceDraft.fromJson(Map<String, dynamic> j) {
    return VoiceDraft(
      jobId: j['job_id'] as String,
      draftId: j['draft_id'] as String,
      transcript: (j['transcript'] as String?) ?? '',
      formatted: VoiceDraftFormatted.fromJson(
          Map<String, dynamic>.from(j['formatted'] as Map)),
      transcriber: TranscriberInfo.fromJson(
          Map<String, dynamic>.from(j['transcriber'] as Map)),
      lang: AiLang.fromWire(j['lang'] as String?),
      remainingQuotaToday:
          ((j['remaining_quota_today'] as num?) ?? 0).toInt(),
      nextStep: (j['next_step'] as String?) ?? '',
    );
  }
}

// ── Tuteur (POST /v1/ai/tutor/ask — Phase 18.6) ────────────────────

class TutorAnswer {
  const TutorAnswer({
    required this.answer,
    required this.disclaimer,
    required this.emergency,
    required this.withinScope,
    required this.provider,
    required this.model,
    required this.remainingQuotaToday,
  });

  /// Réponse complète — le disclaimer y est DÉJÀ inclus par le serveur
  /// (lecture TTS conforme, cf. tutor.policy.ts).
  final String answer;

  /// Répété à part pour mise en avant UI.
  final String disclaimer;

  /// true si la policy a détecté une urgence → styling alerte.
  final bool emergency;
  final bool withinScope;

  /// Provider LLM utilisé (mock par défaut — jamais de clé côté mobile).
  final String provider;
  final String model;

  /// Quota tuteur restant (30/j par défaut).
  final int remainingQuotaToday;

  factory TutorAnswer.fromJson(Map<String, dynamic> j) {
    return TutorAnswer(
      answer: (j['answer'] as String?) ?? '',
      disclaimer: (j['disclaimer'] as String?) ?? '',
      emergency: (j['emergency'] as bool?) ?? false,
      withinScope: (j['within_scope'] as bool?) ?? true,
      provider: (j['provider'] as String?) ?? 'unknown',
      model: (j['model'] as String?) ?? 'unknown',
      remainingQuotaToday:
          ((j['remaining_quota_today'] as num?) ?? 0).toInt(),
    );
  }
}

// ── Adaptive (GET /v1/ai/adaptive/profile — Phase 18.4) ────────────

class FsrsAdjustment {
  const FsrsAdjustment({
    required this.weights,
    required this.changedIndices,
    required this.reasons,
    required this.active,
  });

  /// Les 19 poids FSRS (ajustés si [active], sinon ceux par défaut).
  final List<double> weights;
  final List<int> changedIndices;

  /// Justification explicable de chaque ajustement (v2 §13).
  final List<String> reasons;
  final bool active;

  factory FsrsAdjustment.fromJson(Map<String, dynamic> j) {
    return FsrsAdjustment(
      weights: ((j['weights'] as List?) ?? const [])
          .map((e) => (e as num).toDouble())
          .toList(),
      changedIndices: ((j['changed_indices'] as List?) ?? const [])
          .map((e) => (e as num).toInt())
          .toList(),
      reasons: ((j['reasons'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      active: (j['active'] as bool?) ?? false,
    );
  }
}

class LeechCardInfo {
  const LeechCardInfo({
    required this.cardId,
    required this.lapses,
    required this.tags,
  });

  final String cardId;
  final int lapses;
  final List<String> tags;

  factory LeechCardInfo.fromJson(Map<String, dynamic> j) {
    return LeechCardInfo(
      cardId: j['card_id'] as String,
      lapses: ((j['lapses'] as num?) ?? 0).toInt(),
      tags: ((j['tags'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

class HotTagInfo {
  const HotTagInfo({
    required this.tag,
    required this.reviews,
    required this.lapses,
    required this.lapseRate,
  });

  final String tag;
  final int reviews;
  final int lapses;
  final double lapseRate;

  factory HotTagInfo.fromJson(Map<String, dynamic> j) {
    return HotTagInfo(
      tag: j['tag'] as String,
      reviews: ((j['reviews'] as num?) ?? 0).toInt(),
      lapses: ((j['lapses'] as num?) ?? 0).toInt(),
      lapseRate: ((j['lapse_rate'] as num?) ?? 0).toDouble(),
    );
  }
}

class AdaptiveProfile {
  const AdaptiveProfile({
    required this.userId,
    required this.windowDays,
    required this.totalReviews,
    required this.lapses,
    required this.lapseRate,
    required this.leechCards,
    required this.hotTags,
    required this.fsrsAdjustment,
  });

  final String userId;
  final int windowDays;
  final int totalReviews;
  final int lapses;
  final double lapseRate;
  final List<LeechCardInfo> leechCards;
  final List<HotTagInfo> hotTags;
  final FsrsAdjustment fsrsAdjustment;

  factory AdaptiveProfile.fromJson(Map<String, dynamic> j) {
    return AdaptiveProfile(
      userId: j['user_id'] as String,
      windowDays: ((j['window_days'] as num?) ?? 30).toInt(),
      totalReviews: ((j['total_reviews'] as num?) ?? 0).toInt(),
      lapses: ((j['lapses'] as num?) ?? 0).toInt(),
      lapseRate: ((j['lapse_rate'] as num?) ?? 0).toDouble(),
      leechCards: ((j['leech_cards'] as List?) ?? const [])
          .map((e) => LeechCardInfo.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      hotTags: ((j['hot_tags'] as List?) ?? const [])
          .map((e) => HotTagInfo.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      fsrsAdjustment: FsrsAdjustment.fromJson(
          Map<String, dynamic>.from(j['fsrs_adjustment'] as Map)),
    );
  }
}
