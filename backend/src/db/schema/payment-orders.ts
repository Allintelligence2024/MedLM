import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').unique(),
  plan: text('plan').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('DZD'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('payment_orders_user_idx').on(t.userId, t.createdAt),
  providerRefIdx: uniqueIndex('payment_orders_provider_ref_idx').on(t.providerRef),
}));
