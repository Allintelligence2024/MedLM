// Operator/cron entry point. Read-only by default; --apply opts into audited credits.
// Credentials come only from the process environment, never from CLI arguments.
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { BillingService } from './billing.service';
import { ChargilyPayProvider } from './chargily.provider';
import { PromoCodeProvider } from './promo-code.provider';
import * as schema from '../db/schema';

const report = (message: string) => process.stdout.write(`${message}\n`);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    report(
      'Usage: npm run billing:reconcile -- [--apply]\nDefault: list pending order IDs, no provider request or credit.\nEnvironment: DATABASE_URL; --apply also requires BILLING_RECONCILE_ACTOR_ID (existing admin UUID), CHARGILY_ENV, CHARGILY_API_SECRET.\nScans at most 1000 pending orders per run. Exit 2 means unresolved orders/backlog; exit 1 means execution/configuration failed.',
    );
    return;
  }
  if (args.some((arg) => arg !== '--apply'))
    throw new Error('unsupported argument');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const apply = args.includes('--apply');
  const actorId = process.env.BILLING_RECONCILE_ACTOR_ID;
  if (apply && (!actorId || !/^[0-9a-f-]{36}$/i.test(actorId)))
    throw new Error('admin actor UUID required');
  const minimumAge = Number(
    process.env.BILLING_RECONCILE_MIN_AGE_MINUTES ?? 35,
  );
  if (!Number.isSafeInteger(minimumAge) || minimumAge < 0 || minimumAge > 10080)
    throw new Error('invalid minimum age');
  const cutoff = new Date(Date.now() - minimumAge * 60000);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const db = drizzle(pool, { schema });
    const config = new ConfigService();
    const billing = apply
      ? new BillingService(
          db,
          new ChargilyPayProvider(config),
          new PromoCodeProvider(db),
          config,
        )
      : null;
    if (apply) {
      const [actor] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, actorId!));
      if (actor?.rbacRole !== 'admin')
        throw new Error('actor is not a current administrator');
    }
    let cursor: string | undefined;
    let unresolved = 0;
    let scanned = 0;
    // UUID keyset traversal: a failed oldest order does not starve later pages.
    for (let page = 0; page < 10; page++) {
      const orders = await db
        .select()
        .from(schema.paymentOrders)
        .where(
          and(
            eq(schema.paymentOrders.status, 'pending'),
            lte(schema.paymentOrders.createdAt, cutoff),
            cursor ? gt(schema.paymentOrders.id, cursor) : undefined,
          ),
        )
        .orderBy(asc(schema.paymentOrders.id))
        .limit(100);
      if (!orders.length) break;
      for (const order of orders) {
        scanned++;
        if (!billing) {
          report(
            JSON.stringify({
              orderId: order.id,
              contractVersion: order.contractVersion,
              hasReference: Boolean(order.providerRef),
            }),
          );
          continue;
        }
        if (order.contractVersion !== 2 || !order.providerRef) {
          unresolved++;
          report(
            JSON.stringify({
              orderId: order.id,
              outcome: 'manual_evidence_required',
            }),
          );
          continue;
        }
        try {
          await billing.reconcile({
            actorUserId: actorId!,
            orderId: order.id,
            reason: 'Scheduled authenticated provider reconciliation',
          });
          const [updated] = await db
            .select()
            .from(schema.paymentOrders)
            .where(eq(schema.paymentOrders.id, order.id));
          if (updated?.status === 'pending') unresolved++;
          report(
            JSON.stringify({
              orderId: order.id,
              outcome: updated?.status ?? 'missing',
            }),
          );
        } catch {
          unresolved++;
          // Do not log API response bodies, environment values, or credentials.
          report(
            JSON.stringify({
              orderId: order.id,
              outcome: 'reconciliation_failed',
            }),
          );
        }
      }
      cursor = orders.at(-1)!.id;
      if (orders.length < 100) break;
    }
    report(
      JSON.stringify({
        apply,
        scanned,
        unresolved,
        limitReached: scanned === 1000,
      }),
    );
    if (unresolved || scanned === 1000) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  process.stderr.write(
    'Reconciliation failed: check configuration and database connectivity (details suppressed).',
  );
  process.exitCode = 1;
});
