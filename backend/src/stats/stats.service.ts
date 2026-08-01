// StatsService — Phase 15.2.
//
// Calcule les statistiques utilisateur pour le tableau de bord.
// Toutes les requêtes sont indexées par (user_id, ...). On
// évite de recalculer à la volée pour les stats agrégées : on
// maintient un cache en mémoire par (userId, period) avec TTL
// 60s. Pour la prod, remplacer par un cache Redis (Phase 16+).
//
// Conformité v2 §11.3 — « Dashboard KPIs SRS » : on expose
// exactement les métriques décrites dans la section.
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE_READ, Database } from '../db/database.module';
import { reviewLogs, srsCardState } from '../db/schema/srs';
import { examAttempts } from '../db/schema/exams';

import { cards, decks } from '../db/schema/content';
import { userXpSnapshot } from '../db/schema/gamification';
import { UserStats } from './stats.dto';

@Injectable()
export class StatsService {
  private readonly cache = new Map<string, { stats: UserStats; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 60s

  /// Lectures servies par `DRIZZLE_READ` (audit P2-1) : statistiques utilisateur (agrégats sur review_logs).
  ///
  /// `DRIZZLE_READ` retombe sur la primary tant que
  /// `READ_REPLICA_ENABLED` n'est pas activé ET qu'aucune URL de
  /// réplica n'est configurée — donc aucun changement de comportement
  /// par défaut. Ce service ne fait que des LECTURES : il n'y a rien à
  /// router vers la primary.
  constructor(@Inject(DRIZZLE_READ) private readonly db: Database) {}

  /// Calcule les stats pour un user sur une période.
  async compute(args: { userId: string; period: 'day' | 'week' | 'month' | 'all' }): Promise<UserStats> {
    const cacheKey = `${args.userId}:${args.period}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.stats;
    }
    const stats = await this._compute(args);
    this.cache.set(cacheKey, { stats, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return stats;
  }

  /// Invalide le cache pour un user (appelé après un push de
  /// revues par exemple).
  invalidate(userId: string): void {
    for (const k of [...this.cache.keys()]) {
      if (k.startsWith(`${userId}:`)) this.cache.delete(k);
    }
  }

  private async _compute(args: { userId: string; period: 'day' | 'week' | 'month' | 'all' }): Promise<UserStats> {
    const sinceMs = this._sinceMs(args.period);

    // 1. Agrégats sur review_logs.
    const reviewAgg = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) FILTER (WHERE ${reviewLogs.rating} >= 3)::int`,
        total_duration: sql<number>`coalesce(sum(${reviewLogs.durationMs}), 0)::int`,
      })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.userId, args.userId),
          sinceMs ? gte(reviewLogs.reviewedAt, sinceMs) : sql`true`,
        ),
      )
      .then((rows) => rows[0]);

    const cardsReviewed = reviewAgg?.total ?? 0;
    const cardsCorrect = reviewAgg?.correct ?? 0;
    const totalDuration = reviewAgg?.total_duration ?? 0;

    // 2. Distribution des ratings.
    const ratingRows = await this.db
      .select({
        rating: reviewLogs.rating,
        count: sql<number>`count(*)::int`,
      })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.userId, args.userId),
          sinceMs ? gte(reviewLogs.reviewedAt, sinceMs) : sql`true`,
        ),
      )
      .groupBy(reviewLogs.rating);
    const ratingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
    for (const r of ratingRows) {
      ratingDistribution[String(r.rating)] = r.count;
    }

    // 3. Mock exams.
    const examAgg = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        avg_score: sql<number>`coalesce(avg(${examAttempts.score}), 0)::real`,
      })
      .from(examAttempts)
      .where(
        and(
          eq(examAttempts.userId, args.userId),
          eq(examAttempts.status, 'submitted'),
          sinceMs ? gte(examAttempts.submittedAt, new Date(sinceMs)) : sql`true`,
        ),
      )
      .then((rows) => rows[0]);

    // 4. Streak (côté serveur — le client le calcule aussi).
    // On l'estime grossièrement ici : nombre de jours consécutifs
    // avec au moins 1 review dans la dernière fenêtre.
    const streak = await this._computeStreak(args.userId);

    // 5. XP total (toutes périodes).
    const xpRow = await this.db
      .select({
        total: sql<number>`coalesce(sum(${userXpSnapshot.xpWeek}), 0)::int`,
      })
      .from(userXpSnapshot)
      .where(eq(userXpSnapshot.userId, args.userId))
      .then((rows) => rows[0]);
    const xpTotal = xpRow?.total ?? 0;

    // 6. Niveau.
    const level = this._levelForXp(xpTotal);

    // 7. Cartes par état SRS.
    const stateRows = await this.db
      .select({
        state: srsCardState.state,
        count: sql<number>`count(*)::int`,
      })
      .from(srsCardState)
      .where(eq(srsCardState.userId, args.userId))
      .groupBy(srsCardState.state);
    const cardsByState: Record<string, number> = {
      new: 0,
      learning: 0,
      review: 0,
      relearning: 0,
    };
    for (const r of stateRows) {
      cardsByState[r.state] = r.count;
    }

    // 8. Leechs (lapses >= 8).
    const leechRow = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(srsCardState)
      .where(and(eq(srsCardState.userId, args.userId), gte(srsCardState.lapses, 8)))
      .then((rows) => rows[0]);
    const leechCount = leechRow?.count ?? 0;

    // 9. Top 5 decks.
    const topDecks = await this.db
      .select({
        deckId: cards.deckId,
        count: sql<number>`count(*)::int`,
      })
      .from(reviewLogs)
      .innerJoin(cards, eq(cards.id, reviewLogs.cardId))
      .where(
        and(
          eq(reviewLogs.userId, args.userId),
          sinceMs ? gte(reviewLogs.reviewedAt, sinceMs) : sql`true`,
        ),
      )
      .groupBy(cards.deckId)
      .orderBy(sql`count(*) DESC`)
      .limit(5);
    const deckIds = topDecks.map((d) => d.deckId);
    const deckNames = deckIds.length
      ? await this.db.select({ id: decks.id, nameFr: decks.nameFr }).from(decks).where(sql`${decks.id} = ANY(${sql.raw(`ARRAY[${deckIds.map((i) => `'${i}'`).join(',')}]::uuid[]`)})`)
      : [];
    const nameMap = new Map(deckNames.map((d) => [d.id, d.nameFr]));
    const topDecksFmt = topDecks.map((d) => ({
      deck_id: d.deckId,
      deck_name: nameMap.get(d.deckId) ?? '—',
      cards: d.count,
    }));

    // 10. Forecast next review (médiane des scheduledDays).
    const forecast = await this.db
      .select({
        median: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${srsCardState.scheduledDays})::int`,
      })
      .from(srsCardState)
      .where(and(eq(srsCardState.userId, args.userId), eq(srsCardState.state, 'review')))
      .then((rows) => rows[0]);

    return {
      user_id: args.userId,
      period: args.period,
      cards_reviewed: cardsReviewed,
      cards_correct: cardsCorrect,
      accuracy: cardsReviewed === 0 ? 0 : cardsCorrect / cardsReviewed,
      total_duration_ms: totalDuration,
      avg_duration_ms: cardsReviewed === 0 ? 0 : Math.round(totalDuration / cardsReviewed),
      sessions_count: await this._sessionsCount(args.userId, sinceMs),
      mock_exams_count: examAgg?.count ?? 0,
      mock_exams_avg_score: examAgg?.avg_score ?? 0,
      current_streak: streak.current,
      longest_streak: streak.longest,
      xp_total: xpTotal,
      level,
      cards_by_state: cardsByState,
      top_decks: topDecksFmt,
      leech_count: leechCount,
      rating_distribution: ratingDistribution,
      forecast_next_review_days: forecast?.median ?? 0,
      computed_at: new Date().toISOString(),
    };
  }

  private _sinceMs(period: 'day' | 'week' | 'month' | 'all'): number | null {
    const now = Date.now();
    switch (period) {
      case 'day':
        return now - 24 * 60 * 60 * 1000;
      case 'week':
        return now - 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return now - 30 * 24 * 60 * 60 * 1000;
      case 'all':
        return null;
    }
  }

  private async _computeStreak(userId: string): Promise<{ current: number; longest: number }> {
    // On compte les jours avec au moins 1 review (rated >= 1) sur
    // les 365 derniers jours.
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const rows = await this.db
      .select({
        day: sql<string>`to_char(to_timestamp(${reviewLogs.reviewedAt} / 1000), 'YYYY-MM-DD')`,
      })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, oneYearAgo)))
      .groupBy(sql`to_char(to_timestamp(${reviewLogs.reviewedAt} / 1000), 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(to_timestamp(${reviewLogs.reviewedAt} / 1000), 'YYYY-MM-DD') DESC`);
    if (rows.length === 0) return { current: 0, longest: 0 };

    // Calcule le streak courant (jours consécutifs jusqu'à aujourd'hui).
    const days = new Set(rows.map((r) => r.day));
    let current = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (days.has(key)) {
        current++;
      } else if (i === 0) {
        // Pas encore révisé aujourd'hui : on commence à compter
        // à partir d'hier (le streak n'est pas cassé tant qu'on
        // n'a pas dépassé la grace period).
        continue;
      } else {
        break;
      }
    }

    // Calcule le plus long streak historique.
    const sortedDays = [...days].sort();
    let longest = 1;
    let run = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1]!);
      const cur = new Date(sortedDays[i]!);
      const diff = Math.round((cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
      if (diff === 1) {
        run++;
        longest = Math.max(longest, run);
      } else {
        run = 1;
      }
    }
    return { current, longest };
  }

  private _levelForXp(xp: number): string {
    if (xp >= 10000) return 'Praticien';
    if (xp >= 5000) return 'Résident';
    if (xp >= 2000) return 'Interne';
    if (xp >= 500) return 'Étudiant P2';
    return 'Étudiant P1';
  }

  private async _sessionsCount(userId: string, sinceMs: number | null): Promise<number> {
    // On approxime : 1 session = 1 jour avec >= 1 review.
    const rows = await this.db
      .select({
        day: sql<string>`to_char(to_timestamp(${reviewLogs.reviewedAt} / 1000), 'YYYY-MM-DD')`,
      })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.userId, userId),
          sinceMs ? gte(reviewLogs.reviewedAt, sinceMs) : sql`true`,
        ),
      )
      .groupBy(sql`to_char(to_timestamp(${reviewLogs.reviewedAt} / 1000), 'YYYY-MM-DD')`);
    return rows.length;
  }
}
