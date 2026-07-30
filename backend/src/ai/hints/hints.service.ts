// HintsService — Phase 18.1 (hints adaptatifs, sans LLM).
//
// Pour chaque carte, l'app affiche un hint contextuel calculé à partir :
//   1. du profil : niveau d'expérience *dérivé* du volume de revues et du
//      taux de lapses (pas de champ déclaratif, pas de LLM) ;
//   2. de l'état SRS de la carte (new/review, lapses, reps, difficulté,
//      retard d'échéance) ;
//   3. des métadonnées éditoriales (tags, difficulty_hint, lien examen).
//
// Le niveau d'expérience est recalculé à chaque demande : il suit
// naturellement la progression de l'étudiant (doc v2 §11.3).
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../db/database.module';
import { cards } from '../../db/schema/content';
import { reviewLogs, srsCardState } from '../../db/schema/srs';
import { users } from '../../db/schema/users';
import { FSRS_MILLIS_PER_DAY } from '../../common/fsrs/fsrs.constants';
import {
  ExperienceLevel,
  HintCategory,
  HintContext,
  HintLang,
  buildRationale,
  renderHint,
} from './hint-templates';
import { HintResponse } from './hints.dto';

/// Seuils documentés — toute modification = nouvelle entrée au changelog.
export const HINT_THRESHOLDS = {
  /// < 50 revues totales : l'utilisateur découvre la méthode.
  EXPERIENCE_BEGINNER_MAX_REPS: 50,
  /// ≥ 500 revues ET taux de lapses < 25 % : utilisateur avancé.
  EXPERIENCE_ADVANCED_MIN_REPS: 500,
  EXPERIENCE_ADVANCED_MAX_LAPSE_RATE: 0.25,
  /// Carte "saignante" : dès 4 lapses on active le hint d'aide
  /// (FSRS_LEECH_THRESHOLD=8 = suspension automatique, on agit avant).
  LEECH_HELP_MIN_LAPSES: 4,
  /// Carte jugée difficile : difficulté FSRS ≥ 7/10 ou hint éditorial ≥ 4/5.
  DIFFICULTY_HIGH_FSRS: 7,
  DIFFICULTY_HIGH_EDITORIAL: 4,
  /// Retard de révision déclenchant le rappel de pression.
  DUE_PRESSURE_MIN_DAYS: 3,
  /// Fenêtre de consolidation : 1 à 3 passages.
  CONSOLIDATION_MAX_REPS: 3,
} as const;

/// Tags trop génériques pour servir d'ancre mémorielle.
const GENERIC_TAGS = new Set([
  'anatomie', 'général', 'general', 'cours', 'pcem1', 'qcm', 'révision',
  'revision', 'auto', 'ia', 'voix',
]);

@Injectable()
export class HintsService {
  private readonly logger = new Logger(HintsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ────────────────────────── Logique pure (testée unitairement) ──────────

  /// Niveau d'expérience dérivé du volume de revues et du taux de lapses.
  static deriveExperience(args: {
    totalReps: number;
    lapseRate: number; // lapses / revues totales, ∈ [0,1]
  }): ExperienceLevel {
    if (args.totalReps < HINT_THRESHOLDS.EXPERIENCE_BEGINNER_MAX_REPS) {
      return 'beginner';
    }
    if (
      args.totalReps >= HINT_THRESHOLDS.EXPERIENCE_ADVANCED_MIN_REPS &&
      args.lapseRate < HINT_THRESHOLDS.EXPERIENCE_ADVANCED_MAX_LAPSE_RATE
    ) {
      return 'advanced';
    }
    return 'intermediate';
  }

  /// Normalise les tags : minuscule, trim, déduponnage, longueur ≥ 2,
  /// plafonnés à 8. Déterministe (tri stable), réutilisé par 18.2/18.3.
  static normalizeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
      const t = raw.trim().toLowerCase();
      if (t.length < 2 || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= 8) break;
    }
    return out;
  }

  /// Choisit l'ancre mémorielle : premier tag non générique, sinon le
  /// fallback fourni (nom du module/deck), sinon 'cette notion'.
  static pickAnchor(tags: string[], fallback?: string): string {
    for (const t of tags) {
      if (!GENERIC_TAGS.has(t)) return t;
    }
    const f = fallback?.trim();
    return f && f.length > 1 ? f : 'cette notion';
  }

  /// Sélection de la catégorie — ordre de priorité strict, du signal le
  /// plus actionnable au plus générique.
  static selectHintCategory(input: {
    state: string; // new / learning / review / relearning
    lapses: number;
    isLeech: boolean;
    reps: number;
    hasExamLink: boolean;
    difficulty: number; // FSRS 1..10 (0 si inconnue)
    difficultyHint: number | null; // éditorial 1..5
    overdueDays: number; // 0 si à jour
    experience: ExperienceLevel;
  }): HintCategory {
    if (
      input.isLeech ||
      input.lapses >= HINT_THRESHOLDS.LEECH_HELP_MIN_LAPSES
    ) {
      return 'leech_help';
    }
    if (input.state === 'new' && input.experience === 'beginner') {
      return 'first_encounter';
    }
    if (input.hasExamLink) return 'exam_link';
    if (
      input.difficulty >= HINT_THRESHOLDS.DIFFICULTY_HIGH_FSRS ||
      (input.difficultyHint ?? 0) >= HINT_THRESHOLDS.DIFFICULTY_HIGH_EDITORIAL
    ) {
      return 'difficulty_high';
    }
    if (input.overdueDays >= HINT_THRESHOLDS.DUE_PRESSURE_MIN_DAYS) {
      return 'due_pressure';
    }
    if (
      input.reps >= 1 &&
      input.reps <= HINT_THRESHOLDS.CONSOLIDATION_MAX_REPS
    ) {
      return 'consolidation';
    }
    return 'memory_anchor';
  }

  /// Assemblage final : template + justification.
  static buildHint(args: {
    category: HintCategory;
    ctx: HintContext;
    lang: HintLang;
  }): { text: string; basedOn: string[] } {
    return {
      text: renderHint(args.category, args.ctx, args.lang),
      basedOn: buildRationale(args.category, args.ctx),
    };
  }

  // ────────────────────────── Orchestration DB ───────────────────────────

  /// GET /v1/ai/hints/:cardId — calcule le hint pour (user, carte).
  async getHintForCard(args: {
    userId: string;
    cardId: string;
    langOverride?: HintLang;
    now?: Date;
  }): Promise<HintResponse> {
    const now = args.now ?? new Date();

    // 1. Utilisateur : langue préférée + vérification d'existence.
    const [user] = await this.db
      .select({ id: users.id, langPref: users.langPref })
      .from(users)
      .where(eq(users.id, args.userId));
    if (!user) throw new NotFoundException('user introuvable');

    // 2. Carte : tags, hint éditorial, lien examen.
    const [card] = await this.db
      .select({
        id: cards.id,
        tags: cards.tags,
        difficultyHint: cards.difficultyHint,
        examQuestionId: cards.examQuestionId,
      })
      .from(cards)
      .where(eq(cards.id, args.cardId));
    if (!card) throw new NotFoundException('carte introuvable');

    // 3. Profil d'expérience : agrégat global sur le journal de revues.
    const [agg] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        lapses: sql<number>`count(*) FILTER (WHERE ${reviewLogs.rating} = 1)::int`,
      })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, args.userId));
    const totalReps = agg?.total ?? 0;
    const lapseRate = totalReps === 0 ? 0 : (agg?.lapses ?? 0) / totalReps;
    const experience = HintsService.deriveExperience({ totalReps, lapseRate });

    // 4. État SRS de la carte pour cet utilisateur (absent = jamais vue).
    const [state] = await this.db
      .select({
        state: srsCardState.state,
        reps: srsCardState.reps,
        lapses: srsCardState.lapses,
        difficulty: srsCardState.difficulty,
        isLeech: srsCardState.isLeech,
        dueAt: srsCardState.dueAt,
      })
      .from(srsCardState)
      .where(
        sql`${srsCardState.userId} = ${args.userId} AND ${srsCardState.cardId} = ${args.cardId}`,
      );

    const overdueDays =
      state?.dueAt && state.dueAt < now.getTime()
        ? Math.floor((now.getTime() - state.dueAt) / FSRS_MILLIS_PER_DAY)
        : 0;

    // 5. Sélection + rendu.
    const category = HintsService.selectHintCategory({
      state: state?.state ?? 'new',
      lapses: state?.lapses ?? 0,
      isLeech: state?.isLeech ?? false,
      reps: state?.reps ?? 0,
      hasExamLink: card.examQuestionId != null,
      difficulty: state?.difficulty ?? 0,
      difficultyHint: card.difficultyHint,
      overdueDays,
      experience,
    });

    const tags = HintsService.normalizeTags(card.tags ?? []);
    const ctx: HintContext = {
      anchor: HintsService.pickAnchor(tags),
      lapses: state?.lapses ?? 0,
      reps: state?.reps ?? 0,
      overdueDays,
      difficulty: state?.difficulty ?? 0,
      experience,
    };

    const lang: HintLang =
      args.langOverride ??
      (['fr', 'ar', 'en'].includes(user.langPref)
        ? (user.langPref as HintLang)
        : 'fr');

    const { text, basedOn } = HintsService.buildHint({ category, ctx, lang });

    this.logger.debug(
      `hint: user=${args.userId} card=${args.cardId} category=${category} lang=${lang}`,
    );

    return {
      card_id: args.cardId,
      category,
      hint: text,
      lang,
      experience_level: experience,
      personalized: true,
      based_on: basedOn,
      generated_at: now.toISOString(),
    };
  }
}
