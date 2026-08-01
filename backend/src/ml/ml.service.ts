// MlService — Phase 20.3 : orchestration DB (la logique est dans les
// statiques pures score-predictor.ts / tag-adjustments.ts).
//
// GET /v1/ml/mock-exam-prediction — prédiction explicable (features
// rendues) ou refus k-anonymat documenté ;
// GET /v1/ml/tag-focus           — focus/relax par tag (seuils
// documentés, chiffres expliqués).
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { reviewLogs, srsCardState } from '../db/schema/srs';
import { cards } from '../db/schema/content';
import { FSRS_MILLIS_PER_DAY } from '../common/fsrs/fsrs.constants';
import { HintsService } from '../ai/hints/hints.service';
import { ScorePredictor, ScoreFeatures } from './score-predictor';
import { TagAdjustments, TagAggregate } from './tag-adjustments';

const WINDOW_DAYS = 30;

@Injectable()
export class MlService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// Agrégation des revues récentes de l'utilisateur (pur reste dans
  /// les statiques — ici : lecture uniquement).
  private async aggregates(userId: string, now: Date) {
    const sinceMs = now.getTime() - WINDOW_DAYS * FSRS_MILLIS_PER_DAY;
    const rows = await this.db
      .select({
        cardId: reviewLogs.cardId,
        rating: reviewLogs.rating,
        reviewedAt: reviewLogs.reviewedAt,
        examMode: reviewLogs.examMode,
        tags: cards.tags,
        stability: srsCardState.stability,
      })
      .from(reviewLogs)
      .innerJoin(cards, eq(cards.id, reviewLogs.cardId))
      .leftJoin(
        srsCardState,
        and(
          eq(srsCardState.userId, reviewLogs.userId),
          eq(srsCardState.cardId, reviewLogs.cardId),
        ),
      )
      .where(
        and(
          eq(reviewLogs.userId, userId),
          gte(reviewLogs.reviewedAt, sinceMs),
          eq(reviewLogs.examMode, false),
        ),
      );
    return rows;
  }

  /// Streak (jours consécutifs avec ≥ 1 revue, jusqu'à 90 j en arrière).
  private async streakDays(userId: string, now: Date): Promise<number> {
    const sinceMs = now.getTime() - 90 * FSRS_MILLIS_PER_DAY;
    const rows = await this.db
      .select({ reviewedAt: reviewLogs.reviewedAt })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.userId, userId),
          gte(reviewLogs.reviewedAt, sinceMs),
        ),
      );
    const days = new Set(
      rows.map((r) => Math.floor(r.reviewedAt / FSRS_MILLIS_PER_DAY)),
    );
    let streak = 0;
    let cursor = Math.floor(now.getTime() / FSRS_MILLIS_PER_DAY);
    // Tolérance : si aujourd'hui n'a pas encore de revue, le streak
    // court depuis hier (convention du gamification).
    if (!days.has(cursor)) cursor -= 1;
    while (days.has(cursor)) {
      streak += 1;
      cursor -= 1;
    }
    return streak;
  }

  async predictMockExam(userId: string, now = new Date()) {
    const rows = await this.aggregates(userId, now);
    const distinctCards = new Set(rows.map((r) => r.cardId));
    const correct = rows.filter((r) => r.rating !== 1).length;
    const mature = rows.filter((r) => (r.stability ?? 0) > 21).length;

    const features: ScoreFeatures = {
      reviews30d: rows.length,
      accuracy30d: rows.length === 0 ? 0 : correct / rows.length,
      // Couverture : cartes distinctes vues sur 30 j / cartes
      // distinctes vues dans la fenêtre élargie (approximation
      // documentée — le scope « corpus actif » varie par étudiant).
      coverageRatio: 0,
      matureRatio: rows.length === 0 ? 0 : mature / rows.length,
      streakDays: await this.streakDays(userId, now),
    };
    // Couverture réelle : distinct sur 30 j / distinct total connus.
    const allTime = await this.db
      .select({ cardId: reviewLogs.cardId })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, userId));
    const allDistinct = new Set(allTime.map((r) => r.cardId));
    features.coverageRatio =
      allDistinct.size === 0 ? 0 : distinctCards.size / allDistinct.size;

    const prediction = ScorePredictor.predict(features);
    return {
      user_id: userId,
      window_days: WINDOW_DAYS,
      ...prediction,
    };
  }

  async tagFocus(userId: string, now = new Date()) {
    const rows = await this.aggregates(userId, now);
    const byTag = new Map<string, TagAggregate>();
    for (const r of rows) {
      const tags = HintsService.normalizeTags(r.tags ?? []);
      for (const tag of new Set(tags)) {
        const cur = byTag.get(tag) ?? { tag, reviews: 0, lapses: 0 };
        cur.reviews += 1;
        if (r.rating === 1) cur.lapses += 1;
        byTag.set(tag, cur);
      }
    }
    const { focus, relax } = TagAdjustments.suggest([...byTag.values()]);
    return {
      user_id: userId,
      window_days: WINDOW_DAYS,
      focus,
      relax,
    };
  }
}
