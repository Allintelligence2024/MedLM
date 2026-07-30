/// Schéma Drizzle — utilisateurs & entitlement.
///
/// Équivalent PostgreSQL des tables locales `users` / `entitlements` /
/// `user_devices` / `promo_codes` du doc v2 §7. Les types sont stricts :
/// aucun `unknown` en sortie, le typage est propagé jusqu'aux contrôleurs.
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

/// Utilisateurs — source de vérité (doc v2 §7).
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    phone: text('phone'),
    displayName: text('display_name'),
    faculty: text('faculty'),
    studyYear: integer('study_year'),
    langPref: text('lang_pref').notNull().default('fr'),
    /// Rôle RBAC — student par défaut. Modifiable depuis le CMS (Phase 11)
    /// ou par override d'email via `ADMIN_EMAILS` (.env).
    rbacRole: text('rbac_role').notNull().default('student'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    phoneIdx: index('users_phone_idx').on(t.phone),
  }),
);

/// Appareils connus d'un utilisateur (max 3 actifs, §6.1 v2).
export const userDevices = pgTable(
  'user_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceToken: text('device_token'),
    platform: text('platform').notNull(),
    appVersion: text('app_version'),
    lastActive: timestamp('last_active', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('user_devices_user_idx').on(t.userId),
  }),
);

/// Plans et abonnements (server-side, source de vérité du premium, §8.1).
export const entitlements = pgTable(
  'entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull().default('free'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    graceUntil: timestamp('grace_until', { withTimezone: true }),
    paymentProvider: text('payment_provider'),
    paymentRef: text('payment_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userPlanIdx: uniqueIndex('entitlements_user_plan_idx').on(t.userId, t.plan),
    expiresIdx: index('entitlements_expires_idx').on(t.expiresAt),
  }),
);

/// Codes promotionnels (Phase 7 — squelette Phase 5).
export const promoCodes = pgTable(
  'promo_codes',
  {
    code: text('code').primaryKey(),
    discountPct: integer('discount_pct').notNull(),
    planDurationDays: integer('plan_duration_days').notNull(),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
);

/// Refresh tokens (rotation à chaque usage, §6.1).
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull().references(() => userDevices.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    tokenIdx: uniqueIndex('refresh_tokens_token_idx').on(t.tokenHash),
  }),
);
