/// Schéma Drizzle — partnerships (Phase 20.4).
/// SQL source de vérité : migrations/0016_partnerships.sql.
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const partnerships = pgTable(
  'partnerships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    faculty: text('faculty').notNull(),
    contactEmail: text('contact_email').notNull(),
    /// 'draft' | 'active' | 'suspended' | 'terminated'
    status: text('status').notNull().default('draft'),
    scope: text('scope').array().notNull().default([]),
    commissionPct: integer('commission_pct').notNull().default(0),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index('partnerships_status_idx').on(t.status),
  }),
);
