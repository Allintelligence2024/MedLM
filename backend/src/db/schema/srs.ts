/// Schéma Drizzle — SRS (journal append-only + projection d'état + sync).
///
/// Composant le plus critique de l'architecture (doc v2 §14). Toutes les
/// écritures passent par des contraintes SQL qui empêchent la corruption
/// du journal (cf. trigger SQL généré dans les migrations).
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  bigint,
  timestamp,
  boolean,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { cards } from './content';

/// Journal des revues — APPEND-ONLY. Un trigger SQL refuse UPDATE et
/// DELETE (cf. migration `0002_append_only_triggers.sql`).
export const reviewLogs = pgTable(
  'review_logs',
  {
    /// UUID v7 (time-ordered) — généré côté client (mobile), pas de
    /// defaultRandom() ici. C'est la garantie d'ordre pour la fusion
    /// multi-appareils (Phase 6).
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    rating: integer('rating').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    cardType: text('card_type').notNull().default('basic'),
    examMode: boolean('exam_mode').notNull().default(false),
    reviewedAt: bigint('reviewed_at', { mode: 'number' }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCardIdx: index('review_logs_user_card_idx').on(t.userId, t.cardId, t.reviewedAt, t.id),
    userTimeIdx: index('review_logs_user_time_idx').on(t.userId, t.reviewedAt),
  }),
);

/// Projection d'état — recalculable via fold(events) (Phase 6).
export const srsCardState = pgTable(
  'srs_card_state',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    state: text('state').notNull().default('new'),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    lastReviewAt: bigint('last_review_at', { mode: 'number' }),
    dueAt: bigint('due_at', { mode: 'number' }),
    isLeech: boolean('is_leech').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.cardId] }),
    dueIdx: index('srs_due_idx').on(t.userId, t.dueAt),
    stateIdx: index('srs_state_idx').on(t.userId, t.state),
  }),
);

/// Curseurs de synchronisation, par appareil (doc v2 §6).
export const syncCursors = pgTable(
  'sync_cursors',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    lastPushAt: timestamp('last_push_at', { withTimezone: true }),
    lastPullAt: timestamp('last_pull_at', { withTimezone: true }),
    lastPullCursor: bigint('last_pull_cursor', { mode: 'number' }).notNull().default(0),
    contentCursor: bigint('content_cursor', { mode: 'number' }).notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.deviceId] }),
  }),
);

/// Séances d'étude (Phase 9 — squelette ici pour ne pas multiplier les
/// migrations).
export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deckId: uuid('deck_id').references(() => cards.deckId, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    cardsDueAtStart: integer('cards_due_at_start').notNull().default(0),
    cardsReviewed: integer('cards_reviewed').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    xpEarned: integer('xp_earned').notNull().default(0),
  },
  (t) => ({
    userIdx: index('study_sessions_user_idx').on(t.userId, t.startedAt),
  }),
);
