// Schéma Drizzle — share_cards (Phase 15.5).
//
// Une ligne par carte de partage générée. Stocke le snapshot
// minimal pour que l'image soit reproductible (rendant server
// ou R2 upload). Conformité RGPD : pas d'email, pas d'IP, pas
// de user_agent.
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const shareCards = pgTable(
  'share_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    attemptId: uuid('attempt_id').notNull(),
    /// Pseudonyme (copie du leaderboard_optin.pseudonym au moment
    /// du partage, ou "anonyme" si pas opt-in).
    pseudonym: text('pseudonym').notNull(),
    score: real('score').notNull(),
    pct: integer('pct').notNull(),
    moduleNameFr: text('module_name_fr').notNull(),
    faculty: text('faculty'),
    style: text('style').notNull().default('minimal'),
    imageUrl: text('image_url'),
    shareText: text('share_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    userIdx: index('share_cards_user_idx').on(t.userId, t.createdAt),
    expiresIdx: index('share_cards_expires_idx').on(t.expiresAt),
  }),
);
