// AdaptiveService — Phase 18.4 (adaptive learning).
//
// Deux responsabilités :
//   1. Ajuster dynamiquement les 19 poids FSRS à partir des patterns
//      d'erreur de l'utilisateur (fenêtre glissante). Ajustements
//      conservateurs, bornés ([0.5×, 2×] du poids de base) et
//      *justifiés* — jamais de dérive silencieuse (doc v2 §13).
//   2. Remonter un signal à l'auteur quand une carte fait échouer
//      de nombreux utilisateurs de façon répétée ("repeated_lapses") :
//      la difficulté vient peut-être de la carte, pas des étudiants.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../db/database.module';
import { aiDifficultySignals } from '../../db/schema/ai';
import { cards } from '../../db/schema/content';
import { reviewLogs } from '../../db/schema/srs';
import {
  FSRS_MILLIS_PER_DAY,
  FSRS_WEIGHTS,
} from '../../common/fsrs/fsrs.constants';
import { HintsService } from '../hints/hints.service';

// ── Types d'entrée (purs, testables) ─────────────────────────────────────

export interface ReviewRow {
  cardId: string;
  rating: number; // 1=Again … 4=Easy
  reviewedAt: number; // epoch ms
  tags: string[];
}

export interface ErrorProfile {
  windowDays: number;
  totalReviews: number;
  lapses: number;
  lapseRate: number;
  leechCards: Array<{ cardId: string; reviews: number; lapses: number; tags: string[] }>;
  hotTags: Array<{ tag: string; reviews: number; lapses: number; lapseRate: number }>;
}

export interface SignalInput {
  cardId: string;
  userId: string;
  lapses: number;
}

/// Seuils documentés — changelog obligatoire en cas de modification.
export const ADAPTIVE_THRESHOLDS = {
  /// Fenêtre d'analyse par défaut (jours).
  WINDOW_DAYS: 30,
  /// Un utilisateur encaisse un lapses dès rating=1.
  LAPSE_RATING: 1,
  /// Carte "leech candidate" *pour cet utilisateur*.
  LEECH_MIN_LAPSES: 3,
  LEECH_MIN_LAPSE_RATE: 0.5,
  /// Tag "chaud" : au moins 5 revues et 40 % d'échecs.
  HOT_TAG_MIN_REVIEWS: 5,
  HOT_TAG_MIN_LAPSE_RATE: 0.4,
  HOT_TAG_MAX: 5,
  /// Ajustement FSRS : actif seulement avec ≥ 100 revues dans la fenêtre.
  ADJUST_MIN_REVIEWS: 100,
  /// Facile (utilisateur fort) : taux d'échec ≤ 5 % et ≥ 200 revues.
  STRONG_MAX_LAPSE_RATE: 0.05,
  STRONG_MIN_REVIEWS: 200,
  /// Fragile : taux d'échec ≥ 30 %.
  FRAGILE_MIN_LAPSE_RATE: 0.3,
  /// Bornes des ajustements de poids.
  WEIGHT_MIN_FACTOR: 0.5,
  WEIGHT_MAX_FACTOR: 2.0,
  /// Signal auteur : cartes échouées par ≥ 5 utilisateurs (≥ 3 lapses chacun).
  SIGNAL_MIN_LAPSES_PER_USER: 3,
  SIGNAL_MIN_AFFECTED_USERS: 5,
} as const;

@Injectable()
export class AdaptiveService {
  private readonly logger = new Logger(AdaptiveService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ─────────────────────── Logique pure (testée) ──────────────────────────

  /// Analyse des patterns d'erreur sur une fenêtre glissante.
  static analyzeErrorPatterns(
    rows: ReviewRow[],
    opts: { now: number; windowDays?: number },
  ): ErrorProfile {
    const windowDays = opts.windowDays ?? ADAPTIVE_THRESHOLDS.WINDOW_DAYS;
    const sinceMs = opts.now - windowDays * FSRS_MILLIS_PER_DAY;
    const inWindow = rows.filter((r) => r.reviewedAt >= sinceMs);

    const lapses = inWindow.filter((r) => r.rating === ADAPTIVE_THRESHOLDS.LAPSE_RATING).length;
    const total = inWindow.length;

    // Par carte.
    const byCard = new Map<string, { reviews: number; lapses: number; tags: string[] }>();
    for (const r of inWindow) {
      const cur = byCard.get(r.cardId) ?? { reviews: 0, lapses: 0, tags: r.tags };
      cur.reviews += 1;
      if (r.rating === ADAPTIVE_THRESHOLDS.LAPSE_RATING) cur.lapses += 1;
      byCard.set(r.cardId, cur);
    }
    const leechCards = [...byCard.entries()]
      .filter(
        ([, s]) =>
          s.lapses >= ADAPTIVE_THRESHOLDS.LEECH_MIN_LAPSES &&
          s.lapses / s.reviews >= ADAPTIVE_THRESHOLDS.LEECH_MIN_LAPSE_RATE,
      )
      .map(([cardId, s]) => ({ cardId, reviews: s.reviews, lapses: s.lapses, tags: s.tags }))
      .sort((a, b) => b.lapses - a.lapses);

    // Par tag (normalisé, dédupliqué par revue).
    const byTag = new Map<string, { reviews: number; lapses: number }>();
    for (const r of inWindow) {
      const tags = HintsService.normalizeTags(r.tags);
      for (const tag of new Set(tags)) {
        const cur = byTag.get(tag) ?? { reviews: 0, lapses: 0 };
        cur.reviews += 1;
        if (r.rating === ADAPTIVE_THRESHOLDS.LAPSE_RATING) cur.lapses += 1;
        byTag.set(tag, cur);
      }
    }
    const hotTags = [...byTag.entries()]
      .map(([tag, s]) => ({ tag, reviews: s.reviews, lapses: s.lapses, lapseRate: s.reviews === 0 ? 0 : s.lapses / s.reviews }))
      .filter(
        (t) =>
          t.reviews >= ADAPTIVE_THRESHOLDS.HOT_TAG_MIN_REVIEWS &&
          t.lapseRate >= ADAPTIVE_THRESHOLDS.HOT_TAG_MIN_LAPSE_RATE,
      )
      .sort((a, b) => b.lapseRate - a.lapseRate || b.reviews - a.reviews)
      .slice(0, ADAPTIVE_THRESHOLDS.HOT_TAG_MAX);

    return {
      windowDays,
      totalReviews: total,
      lapses,
      lapseRate: total === 0 ? 0 : lapses / total,
      leechCards,
      hotTags,
    };
  }

  /// Garde-fou : borne chaque poids ajusté dans [0.5×, 2×] de la base.
  static clampWeights(weights: number[]): number[] {
    return weights.map((w, i) => {
      const base = FSRS_WEIGHTS[i]!;
      return Math.min(
        Math.max(w, base * ADAPTIVE_THRESHOLDS.WEIGHT_MIN_FACTOR),
        base * ADAPTIVE_THRESHOLDS.WEIGHT_MAX_FACTOR,
      );
    });
  }

  /// Ajustement FSRS personnalisé (conservateur, justifié).
  ///
  ///   * fragile (échecs ≥ 30 %)  → w[11] × 1.15 : la stabilité post-oubli
  ///     se reconstruit plus vite (l'utilisateur ne s'épuise pas) ;
  ///   * fort (échecs ≤ 5 %, ≥ 200 revues) → w[8] × 1.05 : les rappels
  ///     réussis espacent un peu plus (moins de révisions inutiles).
  static computeFsrsAdjustment(profile: {
    totalReviews: number;
    lapseRate: number;
  }): { weights: number[]; changedIndices: number[]; reasons: string[] } {
    const weights = [...FSRS_WEIGHTS];
    const changedIndices: number[] = [];
    const reasons: string[] = [];

    if (profile.totalReviews < ADAPTIVE_THRESHOLDS.ADJUST_MIN_REVIEWS) {
      return { weights, changedIndices, reasons };
    }
    if (profile.lapseRate >= ADAPTIVE_THRESHOLDS.FRAGILE_MIN_LAPSE_RATE) {
      weights[11] = FSRS_WEIGHTS[11]! * 1.15;
      changedIndices.push(11);
      reasons.push(
        `lapse_rate élevé (${Math.round(profile.lapseRate * 100)}% ≥ 30%) → w11 ×1.15`,
      );
    } else if (
      profile.lapseRate <= ADAPTIVE_THRESHOLDS.STRONG_MAX_LAPSE_RATE &&
      profile.totalReviews >= ADAPTIVE_THRESHOLDS.STRONG_MIN_REVIEWS
    ) {
      weights[8] = FSRS_WEIGHTS[8]! * 1.05;
      changedIndices.push(8);
      reasons.push(
        `lapse_rate faible (${Math.round(profile.lapseRate * 100)}% ≤ 5%) → w8 ×1.05`,
      );
    }
    return {
      weights: AdaptiveService.clampWeights(weights),
      changedIndices,
      reasons,
    };
  }

  /// Agrège les lapses (carte × utilisateur) en signaux pour l'auteur.
  static buildDifficultySignals(
    rows: SignalInput[],
    opts: { minLapsesPerUser?: number; minAffectedUsers?: number } = {},
  ): Array<{ cardId: string; affectedUsers: number; totalLapses: number }> {
    const minLapses =
      opts.minLapsesPerUser ?? ADAPTIVE_THRESHOLDS.SIGNAL_MIN_LAPSES_PER_USER;
    const minUsers =
      opts.minAffectedUsers ?? ADAPTIVE_THRESHOLDS.SIGNAL_MIN_AFFECTED_USERS;

    const byCard = new Map<string, { users: Set<string>; totalLapses: number }>();
    for (const r of rows) {
      if (r.lapses < minLapses) continue;
      const cur = byCard.get(r.cardId) ?? { users: new Set<string>(), totalLapses: 0 };
      cur.users.add(r.userId);
      cur.totalLapses += r.lapses;
      byCard.set(r.cardId, cur);
    }
    return [...byCard.entries()]
      .filter(([, s]) => s.users.size >= minUsers)
      .map(([cardId, s]) => ({
        cardId,
        affectedUsers: s.users.size,
        totalLapses: s.totalLapses,
      }))
      .sort((a, b) => b.affectedUsers - a.affectedUsers || b.totalLapses - a.totalLapses);
  }

  // ─────────────────────── Orchestration DB ────────────────────────────────

  /// GET /v1/ai/adaptive/profile — profil d'erreur + poids FSRS ajustés.
  async getProfile(args: { userId: string; now?: Date }) {
    const now = args.now ?? new Date();
    const sinceMs =
      now.getTime() - ADAPTIVE_THRESHOLDS.WINDOW_DAYS * FSRS_MILLIS_PER_DAY;

    const rows = await this.db
      .select({
        cardId: reviewLogs.cardId,
        rating: reviewLogs.rating,
        reviewedAt: reviewLogs.reviewedAt,
        tags: cards.tags,
      })
      .from(reviewLogs)
      .innerJoin(cards, eq(cards.id, reviewLogs.cardId))
      .where(
        and(eq(reviewLogs.userId, args.userId), gte(reviewLogs.reviewedAt, sinceMs)),
      );

    const profile = AdaptiveService.analyzeErrorPatterns(
      rows.map((r) => ({ ...r, tags: r.tags ?? [] })),
      { now: now.getTime() },
    );
    const adjustment = AdaptiveService.computeFsrsAdjustment(profile);

    return {
      user_id: args.userId,
      window_days: profile.windowDays,
      total_reviews: profile.totalReviews,
      lapses: profile.lapses,
      lapse_rate: Math.round(profile.lapseRate * 1000) / 1000,
      leech_cards: profile.leechCards.slice(0, 10).map((c) => ({
        card_id: c.cardId,
        lapses: c.lapses,
        tags: c.tags,
      })),
      hot_tags: profile.hotTags,
      fsrs_adjustment: {
        weights: adjustment.weights,
        changed_indices: adjustment.changedIndices,
        reasons: adjustment.reasons,
        active: adjustment.changedIndices.length > 0,
      },
    };
  }

  /// GET /v1/ai/adaptive/signals — file de signaux pour les auteurs.
  async listSignals(args: { status: string; limit: number }) {
    const rows = await this.db
      .select({
        id: aiDifficultySignals.id,
        cardId: aiDifficultySignals.cardId,
        reason: aiDifficultySignals.reason,
        affectedUsers: aiDifficultySignals.affectedUsers,
        totalLapses: aiDifficultySignals.totalLapses,
        windowDays: aiDifficultySignals.windowDays,
        status: aiDifficultySignals.status,
        createdAt: aiDifficultySignals.createdAt,
      })
      .from(aiDifficultySignals)
      .where(eq(aiDifficultySignals.status, args.status))
      .orderBy(desc(aiDifficultySignals.affectedUsers))
      .limit(args.limit);
    return { status: args.status, signals: rows };
  }

  /// POST /v1/ai/adaptive/signals/scan — balayage global (éditeur/cron).
  /// Idempotent : un seul signal 'open' par carte (index partiel UNIQUE
  /// côté SQL cf. migration 0013).
  async runScan(args: {
    minLapsesPerUser: number;
    minAffectedUsers: number;
    windowDays: number;
    now?: Date;
  }) {
    const now = args.now ?? new Date();
    const sinceMs = now.getTime() - args.windowDays * FSRS_MILLIS_PER_DAY;

    const rows = await this.db
      .select({
        cardId: reviewLogs.cardId,
        userId: reviewLogs.userId,
        lapses: sql<number>`count(*) FILTER (WHERE ${reviewLogs.rating} = 1)::int`,
      })
      .from(reviewLogs)
      .where(gte(reviewLogs.reviewedAt, sinceMs))
      .groupBy(reviewLogs.cardId, reviewLogs.userId);

    const candidates = AdaptiveService.buildDifficultySignals(rows, {
      minLapsesPerUser: args.minLapsesPerUser,
      minAffectedUsers: args.minAffectedUsers,
    });

    let created = 0;
    let skippedExisting = 0;
    for (const c of candidates) {
      const [existing] = await this.db
        .select({ id: aiDifficultySignals.id })
        .from(aiDifficultySignals)
        .where(
          and(
            eq(aiDifficultySignals.cardId, c.cardId),
            eq(aiDifficultySignals.status, 'open'),
          ),
        );
      if (existing) {
        skippedExisting += 1;
        continue;
      }
      await this.db.insert(aiDifficultySignals).values({
        cardId: c.cardId,
        reason: 'repeated_lapses',
        affectedUsers: c.affectedUsers,
        totalLapses: c.totalLapses,
        windowDays: args.windowDays,
        status: 'open',
      });
      created += 1;
    }

    this.logger.log(
      `adaptive scan: window=${args.windowDays}d candidates=${candidates.length} created=${created} skipped=${skippedExisting}`,
    );
    return {
      window_days: args.windowDays,
      min_lapses_per_user: args.minLapsesPerUser,
      min_affected_users: args.minAffectedUsers,
      candidate_cards: candidates.length,
      new_signals: created,
      skipped_existing: skippedExisting,
    };
  }
}
