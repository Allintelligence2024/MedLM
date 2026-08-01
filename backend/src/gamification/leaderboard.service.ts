// LeaderboardService — Phase 9 bis.
//
// Responsabilités :
//   * optIn() : enregistre le consentement + pseudonymat.
//   * optOut() : révoque le consentement (RGPD, droit à l'effacement).
//   * isOptIn() : vérifie l'état d'opt-in d'un user.
//   * currentWeek() : retourne la semaine ISO courante (`YYYY-Www`).
//   * snapshot() : upsert le snapshot hebdo d'un user (appelé
//     après chaque session d'étude, par un cron ou un trigger
//     applicatif).
//   * top() : top N pour le GET /leaderboard, avec filtres
//     faculté/année.
//   * myRank() : rang de l'utilisateur courant dans son scope.
//
// Choix structurants :
//   * Pas de calcul à la volée : on lit `user_xp_snapshot` qui est
//     écrit en fin de session. Si un user n'a pas encore de
//     snapshot, il n'apparaît pas.
//   * Le top est trié par `xp_week` DESC, `cards_reviewed` DESC,
//     `mock_exams` DESC (tie-breaker déterministe).
//   * Le service ne POSE PAS le snapshot — c'est un job cron qui
//     le fait (cf. cron_helpers.ts, livré en Phase 10+).
import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE_READ, Database } from '../db/database.module';
import { leaderboardOptin, userXpSnapshot } from '../db/schema/gamification';

import { LeaderboardEntry, LeaderboardResponse, OptInBody } from './leaderboard.dto';

const PSEUDONYM_TAKEN = 'pseudonyme déjà pris';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  /// Lectures servies par `DRIZZLE_READ` (audit P2-1) : classement hebdomadaire (agrégat sur tous les utilisateurs).
  ///
  /// `DRIZZLE_READ` retombe sur la primary tant que
  /// `READ_REPLICA_ENABLED` n'est pas activé ET qu'aucune URL de
  /// réplica n'est configurée — donc aucun changement de comportement
  /// par défaut. Ce service ne fait que des LECTURES : il n'y a rien à
  /// router vers la primary.
  constructor(@Inject(DRIZZLE_READ) private readonly db: Database) {}

  /// Calcule la semaine ISO courante. Format `YYYY-Www`.
  currentWeek(now: Date = new Date()): string {
    // Algorithme ISO 8601 — copie de la RFC.
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  /// Opt-in : enregistre pseudonymat + segment.
  async optIn(userId: string, body: OptInBody): Promise<{ pseudonym: string }> {
    // 1. Vérifier que l'utilisateur n'est pas déjà opt-in.
    const existing = await this.db
      .select()
      .from(leaderboardOptin)
      .where(eq(leaderboardOptin.userId, userId))
      .then((rows) => rows[0]);
    if (existing && !existing.revokedAt) {
      throw new BadRequestException('déjà opt-in');
    }
    // 2. Vérifier l'unicité du pseudonyme (insensible à la casse).
    const taken = await this.db
      .select()
      .from(leaderboardOptin)
      .where(eq(leaderboardOptin.pseudonym, body.pseudonym))
      .then((rows) => rows[0]);
    if (taken && taken.userId !== userId) {
      throw new BadRequestException(PSEUDONYM_TAKEN);
    }
    // 3. Insert ou ré-activation.
    if (existing) {
      await this.db
        .update(leaderboardOptin)
        .set({
          pseudonym: body.pseudonym,
          faculty: body.faculty ?? existing.faculty,
          studyYear: body.study_year ?? existing.studyYear,
          optInAt: new Date(),
          revokedAt: null,
        })
        .where(eq(leaderboardOptin.userId, userId));
    } else {
      await this.db.insert(leaderboardOptin).values({
        userId,
        pseudonym: body.pseudonym,
        faculty: body.faculty ?? null,
        studyYear: body.study_year ?? null,
      });
    }
    this.logger.log(`opt-in: user=${userId} pseudonym=${body.pseudonym}`);
    return { pseudonym: body.pseudonym };
  }

  /// Opt-out (RGPD) — on marque `revokedAt` mais on garde la ligne
  /// (audit). Les snapshots et badges sont conservés tant que le
  /// user ne demande pas leur suppression.
  async optOut(userId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(leaderboardOptin)
      .where(eq(leaderboardOptin.userId, userId))
      .then((rows) => rows[0]);
    if (!existing) throw new NotFoundException("pas d'opt-in actif");
    await this.db
      .update(leaderboardOptin)
      .set({ revokedAt: new Date() })
      .where(eq(leaderboardOptin.userId, userId));
    this.logger.log(`opt-out: user=${userId}`);
  }

  /// État d'opt-in courant.
  async isOptIn(userId: string): Promise<boolean> {
    const row = await this.db
      .select({ revokedAt: leaderboardOptin.revokedAt })
      .from(leaderboardOptin)
      .where(eq(leaderboardOptin.userId, userId))
      .then((rows) => rows[0]);
    return !!row && !row.revokedAt;
  }

  /// Snapshot hebdo — appelé par le cron / le consumer de
  /// sessions. Idempotent (UPSERT).
  async snapshot(args: {
    userId: string;
    weekIso: string;
    xpWeek: number;
    cardsReviewed: number;
    mockExams: number;
  }): Promise<void> {
    await this.db
      .insert(userXpSnapshot)
      .values({
        userId: args.userId,
        weekIso: args.weekIso,
        xpWeek: args.xpWeek,
        cardsReviewed: args.cardsReviewed,
        mockExams: args.mockExams,
      })
      .onConflictDoUpdate({
        target: [userXpSnapshot.userId, userXpSnapshot.weekIso],
        set: {
          xpWeek: args.xpWeek,
          cardsReviewed: args.cardsReviewed,
          mockExams: args.mockExams,
          snapshotAt: new Date(),
        },
      });
  }

  /// Top N du leaderboard. Filtres optionnels.
  /// Renvoie aussi le rang de l'utilisateur courant (s'il est opt-in).
  async top(args: {
    userId: string;
    weekIso: string;
    faculty?: string;
    studyYear?: number;
    limit: number;
  }): Promise<LeaderboardResponse> {
    // 1. Sous-requête : ID des users opt-in (non révoqués) qui
    //    matchent les filtres et qui ont un snapshot cette semaine.
    const conditions = [
      // `isNull`, PAS `eq(col, null)` : en SQL, `x = NULL` n'est jamais
      // vrai (c'est UNKNOWN, donc filtré). La requête ne renvoyait donc
      // JAMAIS aucun participant — le classement était vide pour tout le
      // monde, en permanence. Vérifié en base : `= NULL` → 0 ligne,
      // `IS NULL` → 1 ligne, sur la même donnée.
      //
      // Le `as never` qui accompagnait l'écriture était l'indice : le
      // typage de drizzle refusait déjà cette comparaison.
      isNull(leaderboardOptin.revokedAt),
      eq(userXpSnapshot.weekIso, args.weekIso),
    ];
    if (args.faculty) {
      conditions.push(eq(leaderboardOptin.faculty, args.faculty));
    }
    if (args.studyYear !== undefined) {
      conditions.push(eq(leaderboardOptin.studyYear, args.studyYear));
    }
    const rows = await this.db
      .select({
        userId: userXpSnapshot.userId,
        pseudonym: leaderboardOptin.pseudonym,
        faculty: leaderboardOptin.faculty,
        studyYear: leaderboardOptin.studyYear,
        xpWeek: userXpSnapshot.xpWeek,
        cardsReviewed: userXpSnapshot.cardsReviewed,
        mockExams: userXpSnapshot.mockExams,
      })
      .from(userXpSnapshot)
      .innerJoin(
        leaderboardOptin,
        eq(leaderboardOptin.userId, userXpSnapshot.userId),
      )
      .where(and(...conditions))
      .orderBy(
        desc(userXpSnapshot.xpWeek),
        desc(userXpSnapshot.cardsReviewed),
        desc(userXpSnapshot.mockExams),
      )
      .limit(args.limit);

    const entries: LeaderboardEntry[] = rows.map((r, i) => ({
      rank: i + 1,
      pseudonym: r.pseudonym,
      faculty: r.faculty ?? null,
      study_year: r.studyYear ?? null,
      xp_week: r.xpWeek,
      cards_reviewed: r.cardsReviewed,
      mock_exams: r.mockExams,
    }));

    // 2. Rang du user courant (s'il est opt-in et dans la limite).
    const me = entries.find((e) => e.pseudonym && entries.indexOf(e) >= 0);
    let myRank: number | null = null;
    if (me) {
      // Récupère le pseudonymat du user courant.
      const meRow = await this.db
        .select({ pseudonym: leaderboardOptin.pseudonym })
        .from(leaderboardOptin)
        .where(eq(leaderboardOptin.userId, args.userId))
        .then((rows) => rows[0]);
      if (meRow && !meRow.pseudonym) myRank = null;
      const idx = entries.findIndex((e) => e.pseudonym === meRow?.pseudonym);
      if (idx >= 0) myRank = idx + 1;
    }
    // Si le user courant est opt-in mais hors top, on calcule
    // son rang exact (scan supplémentaire).
    if (myRank === null) {
      const meRow = await this.db
        .select({ pseudonym: leaderboardOptin.pseudonym })
        .from(leaderboardOptin)
        .where(eq(leaderboardOptin.userId, args.userId))
        .then((rows) => rows[0]);
      if (meRow && !meRow.pseudonym) {
        // Pas opt-in → myRank reste null.
      } else if (meRow) {
        const allMyConditions = [
          isNull(leaderboardOptin.revokedAt),
          eq(userXpSnapshot.weekIso, args.weekIso),
        ];
        if (args.faculty) allMyConditions.push(eq(leaderboardOptin.faculty, args.faculty));
        if (args.studyYear !== undefined) allMyConditions.push(eq(leaderboardOptin.studyYear, args.studyYear));
        const myRow = await this.db
          .select({
            xpWeek: userXpSnapshot.xpWeek,
            cardsReviewed: userXpSnapshot.cardsReviewed,
            mockExams: userXpSnapshot.mockExams,
          })
          .from(userXpSnapshot)
          .innerJoin(leaderboardOptin, eq(leaderboardOptin.userId, userXpSnapshot.userId))
          .where(and(...allMyConditions, eq(leaderboardOptin.pseudonym, meRow.pseudonym)))
          .then((rows) => rows[0]);
        if (myRow) {
          // Compte combien de users ont un meilleur score.
          const betterConditions = [
            isNull(leaderboardOptin.revokedAt),
            eq(userXpSnapshot.weekIso, args.weekIso),
          ];
          if (args.faculty) betterConditions.push(eq(leaderboardOptin.faculty, args.faculty));
          if (args.studyYear !== undefined) betterConditions.push(eq(leaderboardOptin.studyYear, args.studyYear));
          const rankRow = await this.db
            .select({ c: sql<number>`count(*)` })
            .from(userXpSnapshot)
            .innerJoin(leaderboardOptin, eq(leaderboardOptin.userId, userXpSnapshot.userId))
            .where(
              and(
                ...betterConditions,
                sql`(${userXpSnapshot.xpWeek}, ${userXpSnapshot.cardsReviewed}, ${userXpSnapshot.mockExams})
                    > (${myRow.xpWeek}, ${myRow.cardsReviewed}, ${myRow.mockExams})`,
              ),
            )
            .then((rows) => rows[0]);
          myRank = (rankRow?.c ?? 0) + 1;
        }
      }
    }

    return {
      week_iso: args.weekIso,
      total_entries: entries.length,
      entries,
      my_rank: myRank,
    };
  }
}
