import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { users, promoCodes } from './users';
import { groupPacks } from './group-packs';
import { sql } from 'drizzle-orm';

export const paymentOrders = pgTable(
  'payment_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref').unique(),
    plan: text('plan').notNull(),
    amountCents: integer('amount_cents').notNull(),
    // Nullable only for legacy orders awaiting manual reconciliation.
    durationDays: integer('duration_days'),
    contractVersion: integer('contract_version').notNull().default(1),
    promoCode: text('promo_code').references(() => promoCodes.code),
    groupPackId: uuid('group_pack_id').references(() => groupPacks.id),
    checkoutUrl: text('checkout_url'),
    currency: text('currency').notNull().default('DZD'),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => ({
    groupLiveIdx: uniqueIndex('payment_orders_group_live_idx')
      .on(t.groupPackId)
      .where(
        sql`${t.groupPackId} IS NOT NULL AND ${t.status} IN ('pending', 'paid')`,
      ),
    userIdx: index('payment_orders_user_idx').on(t.userId, t.createdAt),
    providerRefIdx: uniqueIndex('payment_orders_provider_ref_idx').on(
      t.providerRef,
    ),
  }),
);

export const paymentOrderBeneficiaries = pgTable(
  'payment_order_beneficiaries',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => paymentOrders.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orderId, t.userId] }) }),
);
