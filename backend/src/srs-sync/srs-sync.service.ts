/// Service SRS Sync — implémente le protocole push/pull/rebuild.
///
/// C'est le pendant serveur de `SyncOutboxUseCase` côté mobile. La
/// symétrie est volontaire : les deux opèrent sur le même contrat
/// (`ReviewEventDto`), ce qui rend la fusion multi-appareils déterministe.
///
/// Algorithme push :
///   1. dédupliquer par id (idempotence — un push rejoué est inoffensif) ;
///   2. insérer dans `review_logs` (trigger SQL append-only protège) ;
///   3. pour chaque carte touchée, rejouer le journal complet via
///      `FsrsEngine.fold` et mettre à jour `srs_card_state` ;
///   4. retourner les ids acceptés.
///
/// Algorithme pull :
///   1. lire `review_logs` depuis le curseur ;
///   2. le client rejoue `fold` localement (c'est sa responsabilité).
import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { and, eq, gte, asc, inArray } from 'drizzle-orm';
import { reviewLogs, srsCardState, syncCursors } from '../db/schema';
import { DRIZZLE, Database } from '../db/database.module';
import { FsrsEngine } from '../common/fsrs/fsrs.engine';
import { CardType, Rating, ReviewEvent } from '../common/fsrs/fsrs.constants';
import { PushResponse, PullResponse, ReviewEventDto } from './srs-sync.dto';

const PUSH_BATCH_MAX = 100;
const PULL_LIMIT_MAX = 500;

@Injectable()
export class SrsSyncService {
  private readonly logger = new Logger(SrsSyncService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly engine: FsrsEngine,
  ) {}

  /// POST /srs-sync/push
  async push(args: {
    userId: string;
    deviceId: string;
    events: ReviewEventDto[];
  }): Promise<PushResponse> {
    if (args.events.length > PUSH_BATCH_MAX) {
      throw new BadRequestException(
        `trop d'événements : ${args.events.length} > ${PUSH_BATCH_MAX}`,
      );
    }

    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];

    // Transaction : on isole la séquence d'insertions et de folds.
    await this.db.transaction(async (tx) => {
      // 1. dédupliquer côté serveur (le mobile a déjà dédupliqué, mais
      //    un acteur malveillant peut rejouer un batch).
      const ids = args.events.map((e) => e.id);
      // `inArray` plutôt que `= ANY(${ids}::uuid[])`.
      //
      // Drizzle interpole un tableau JS comme un paramètre SCALAIRE :
      // PostgreSQL recevait un UUID là où il attendait un tableau et
      // répondait « malformed array literal ». Résultat : TOUT push de
      // synchronisation partait en 500 — la boucle centrale du produit
      // était inutilisable (bug trouvé le 2026-08-01 en poussant un
      // événement réel contre une vraie base).
      //
      // Les tests ne l'attrapaient pas : ils substituent un faux
      // DRIZZLE qui n'exécute aucun SQL.
      const existing = await tx
        .select({ id: reviewLogs.id })
        .from(reviewLogs)
        .where(
          and(inArray(reviewLogs.id, ids), eq(reviewLogs.userId, args.userId)),
        );
      const existingSet = new Set(existing.map((r) => r.id));

      const cardsToRebuild = new Set<string>();
      for (const e of args.events) {
        if (existingSet.has(e.id)) {
          accepted.push(e.id);
          continue;
        }
        try {
          await tx.insert(reviewLogs).values({
            id: e.id,
            userId: args.userId,
            cardId: e.card_id,
            deviceId: e.device_id,
            rating: e.rating,
            durationMs: e.duration_ms,
            cardType: e.card_type,
            examMode: e.exam_mode,
            reviewedAt: e.reviewed_at,
          });
          accepted.push(e.id);
          cardsToRebuild.add(e.card_id);
        } catch (err) {
          this.logger.warn(`rejet event ${e.id}: ${(err as Error).message}`);
          rejected.push({ id: e.id, reason: (err as Error).message });
        }
      }

      // 2. pour chaque carte touchée, on rejoue le journal et on
      //    upsert l'état.
      for (const cardId of cardsToRebuild) {
        const log = await tx
          .select()
          .from(reviewLogs)
          .where(
            and(
              eq(reviewLogs.userId, args.userId),
              eq(reviewLogs.cardId, cardId),
            ),
          )
          .orderBy(asc(reviewLogs.reviewedAt), asc(reviewLogs.id));

        const events: ReviewEvent[] = log.map((row) => ({
          id: row.id,
          cardId: row.cardId,
          userId: row.userId,
          deviceId: row.deviceId,
          rating: row.rating as Rating,
          durationMs: row.durationMs,
          cardType: row.cardType as CardType,
          examMode: row.examMode,
          reviewedAtMs: row.reviewedAt,
        }));
        const state = this.engine.fold(events);

        await tx
          .insert(srsCardState)
          .values({
            userId: args.userId,
            cardId,
            state: state.state,
            stability: state.stability,
            difficulty: state.difficulty,
            elapsedDays: state.elapsedDays,
            scheduledDays: state.scheduledDays,
            reps: state.reps,
            lapses: state.lapses,
            lastReviewAt: state.lastReviewMs,
            dueAt: state.dueMs,
            isLeech: state.isLeech,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [srsCardState.userId, srsCardState.cardId],
            set: {
              state: state.state,
              stability: state.stability,
              difficulty: state.difficulty,
              elapsedDays: state.elapsedDays,
              scheduledDays: state.scheduledDays,
              reps: state.reps,
              lapses: state.lapses,
              lastReviewAt: state.lastReviewMs,
              dueAt: state.dueMs,
              isLeech: state.isLeech,
              updatedAt: new Date(),
            },
          });
      }

      // 3. mettre à jour le curseur de push.
      await tx
        .insert(syncCursors)
        .values({
          userId: args.userId,
          deviceId: args.deviceId,
          lastPushAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [syncCursors.userId, syncCursors.deviceId],
          set: { lastPushAt: new Date() },
        });
    });

    return {
      accepted,
      rejected,
      server_time_ms: Date.now(),
    };
  }

  /// GET /srs-sync/pull
  async pull(args: {
    userId: string;
    deviceId: string;
    sinceMs: number;
    limit: number;
  }): Promise<PullResponse> {
    const limit = Math.min(args.limit, PULL_LIMIT_MAX);
    const rows = await this.db
      .select()
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.userId, args.userId),
          gte(reviewLogs.reviewedAt, args.sinceMs),
        ),
      )
      .orderBy(asc(reviewLogs.reviewedAt), asc(reviewLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor = page.length > 0 ? page[page.length - 1]!.reviewedAt : args.sinceMs;

    // On met à jour le curseur après lecture.
    await this.db
      .insert(syncCursors)
      .values({
        userId: args.userId,
        deviceId: args.deviceId,
        lastPullAt: new Date(),
        lastPullCursor: nextCursor,
      })
      .onConflictDoUpdate({
        target: [syncCursors.userId, syncCursors.deviceId],
        set: { lastPullAt: new Date(), lastPullCursor: nextCursor },
      });

    return {
      events: page.map((r) => ({
        id: r.id,
        card_id: r.cardId,
        user_id: r.userId,
        device_id: r.deviceId,
        rating: r.rating as 1 | 2 | 3 | 4,
        duration_ms: r.durationMs,
        card_type: r.cardType as CardType,
        reviewed_at: r.reviewedAt,
        exam_mode: r.examMode,
      })),
      next_cursor_ms: nextCursor,
      has_more: hasMore,
    };
  }
}
