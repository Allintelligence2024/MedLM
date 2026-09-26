/// Persistent magic-link challenges. The raw token is never stored.
import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('auth_challenges_token_idx').on(t.tokenHash),
    emailIdx: index('auth_challenges_email_idx').on(t.email, t.createdAt),
    expiryIdx: index('auth_challenges_expiry_idx').on(t.expiresAt),
  }),
);
