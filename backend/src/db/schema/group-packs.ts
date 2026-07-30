// Schéma Drizzle — group_packs (Phase 16.3).
//
// Un pack groupe = 1 coordinateur + 4 invités = 5 étudiants
// qui achètent ensemble avec une réduction de 30% sur le prix
// de base.
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/// Table principale des packs.
export const groupPacks = pgTable(
  'group_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /// User qui a créé le pack (premier membre, coordinateur).
    coordinatorUserId: uuid('coordinator_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull(),
    faculty: text('faculty'),
    /// Code d'invitation à 6 caractères (A-Z, 0-9), unique.
    inviteCode: text('invite_code').notNull(),
    /// Statut du pack.
    status: text('status').notNull().default('pending'),
    /// Coût par user (en centimes) après réduction groupe.
    perUserCents: integer('per_user_cents').notNull(),
    /// Référence Chargily du paiement groupé (null tant que pas payé).
    paymentRef: text('payment_ref'),
    /// Date d'expiration (24h après création — au-delà, le pack
    /// est marqué 'expired' et les entitlements ne sont pas activés).
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    inviteCodeIdx: uniqueIndex('group_packs_invite_code_idx').on(t.inviteCode),
    coordinatorIdx: index('group_packs_coordinator_idx').on(t.coordinatorUserId, t.createdAt),
    statusIdx: index('group_packs_status_idx').on(t.status, t.expiresAt),
  }),
);

/// Membres d'un pack. (user_id, pack_id) est unique — un user ne
/// peut pas être deux fois dans le même pack.
export const groupPackMembers = pgTable(
  'group_pack_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    packId: uuid('pack_id')
      .notNull()
      .references(() => groupPacks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isCoordinator: text('is_coordinator').notNull().default('false'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    packUserIdx: uniqueIndex('group_pack_members_pack_user_idx').on(t.packId, t.userId),
    userIdx: index('group_pack_members_user_idx').on(t.userId),
  }),
);
