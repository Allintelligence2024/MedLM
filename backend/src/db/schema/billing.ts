// Schéma Drizzle — billing (Phase 7).
//
// Tables : webhook_events (idempotence des providers), audit_log (RBAC
// trace). Ces tables sont générées par Drizzle à partir des types ci-
// dessous ; la migration SQL correspondante est dans
// `migrations/0003_billing_rbac.sql`.
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: text('event_id').notNull(),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    processed: boolean('processed').notNull().default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventProviderUnique: uniqueIndex('webhook_events_event_id_provider_unique').on(
      t.eventId,
      t.provider,
    ),
    unprocessedIdx: index('webhook_events_unprocessed_idx').on(
      t.provider,
      t.processed,
      t.receivedAt,
    ),
  }),
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index('audit_log_actor_idx').on(t.actorUserId, t.occurredAt),
    targetIdx: index('audit_log_target_idx').on(t.targetType, t.targetId),
  }),
);

export const paymentOrders = pgTable(
  'payment_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('chargily'),
    providerRef: text('provider_ref').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('DZD'),
    plan: text('plan').notNull(),
    status: text('status').notNull().default('pending'),
    rawPayload: jsonb('raw_payload').notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerRefIdx: uniqueIndex('payment_orders_provider_ref_idx').on(t.providerRef),
    userIdx: index('payment_orders_user_idx').on(t.userId),
    statusIdx: index('payment_orders_status_idx').on(t.status),
  }),
);
