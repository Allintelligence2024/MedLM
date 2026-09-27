// PostgreSQL server, independent connections: exercises actual row-lock waits.
// CI integration job supplies DATABASE_URL. Local runs without it explicitly skip.
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { GroupPacksService } from '../../src/group-packs/group-packs.service';
import { BillingService } from '../../src/billing/billing.service';
import { ChargilyPayProvider } from '../../src/billing/chargily.provider';
import { PromoCodeProvider } from '../../src/billing/promo-code.provider';
import { type Database } from '../../src/db/database.module';
import * as schema from '../../src/db/schema';

// Captured by Vitest config before other suites set a dummy DATABASE_URL.
const url = process.env.BILLING_TEST_DATABASE_URL;
if (process.env.CI && !url)
  throw new Error(
    'Billing concurrency requires BILLING_TEST_DATABASE_URL in CI',
  );
const suite = url ? describe : describe.skip;

suite(
  'Billing — concurrent PostgreSQL connections (requires BILLING_TEST_DATABASE_URL)',
  () => {
    const namespace = `billing_${randomUUID().replaceAll('-', '')}`;
    let schemaCreated = false;
    let admin: Pool;
    let pool: Pool;
    let db: Database;
    let service: BillingService;
    let legacyOrderId: string;
    let legacyGroupId: string;

    beforeAll(async () => {
      admin = new Pool({ connectionString: url, max: 1 });
      await admin.query(`CREATE SCHEMA "${namespace}"`);
      schemaCreated = true;
      pool = new Pool({
        connectionString: url,
        max: 4,
        application_name: namespace,
        options: `-c search_path=${namespace},public`,
      });
      const dir = join(__dirname, '../../src/db/migrations');
      const journal = JSON.parse(
        readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
      );
      for (const entry of journal.entries) {
        if (entry.tag === '0024_payment_fulfillment') {
          const legacyUser = await pool.query(
            'INSERT INTO users(email) VALUES ($1) RETURNING id',
            [`${randomUUID()}@legacy.invalid`],
          );
          legacyOrderId = (
            await pool.query(
              "INSERT INTO payment_orders(user_id, provider, provider_ref, plan, amount_cents) VALUES ($1, 'chargily', 'legacy-individual', 'monthly', 35000) RETURNING id",
              [legacyUser.rows[0].id],
            )
          ).rows[0].id;
          legacyGroupId = (
            await pool.query(
              "INSERT INTO payment_orders(user_id, provider, provider_ref, plan, amount_cents) VALUES ($1, 'chargily', 'legacy-group', 'group', 840000) RETURNING id",
              [legacyUser.rows[0].id],
            )
          ).rows[0].id;
        }
        const sql = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8');
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim()) await pool.query(statement);
        }
      }
      db = drizzle(pool, { schema });
      const config = new ConfigService({});
      const provider = new ChargilyPayProvider(config);
      vi.spyOn(provider, 'createPayment').mockImplementation(async (args) => ({
        url: 'https://example.invalid/checkout',
        providerRef: randomUUID(),
        amount_cents: args.amount_cents,
        currency: 'DZD',
      }));
      service = new BillingService(
        db,
        provider,
        new PromoCodeProvider(db),
        config,
      );
    }, 60_000);

    afterAll(async () => {
      await pool?.end();
      if (admin) {
        try {
          if (schemaCreated)
            await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
        } finally {
          await admin.end();
        }
      }
    });

    it('upgrades populated legacy orders without inventing duration, unit conversion or group members', async () => {
      const [order] = await db
        .select()
        .from(schema.paymentOrders)
        .where(eq(schema.paymentOrders.id, legacyOrderId));
      expect(order).toMatchObject({
        contractVersion: 1,
        durationDays: null,
        amountCents: 35000,
      });
      expect(
        await db
          .select()
          .from(schema.paymentOrderBeneficiaries)
          .where(eq(schema.paymentOrderBeneficiaries.orderId, legacyOrderId)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(schema.paymentOrderBeneficiaries)
          .where(eq(schema.paymentOrderBeneficiaries.orderId, legacyGroupId)),
      ).toHaveLength(0);
      await expect(
        service.handleChargilyWebhook({
          eventId: randomUUID(),
          eventType: 'checkout.paid',
          payload: {
            id: 'legacy-individual',
            status: 'paid',
            amount: 350,
            currency: 'DZD',
          },
        }),
      ).rejects.toThrow('historique');
    });

    it.each(['same-event', 'different-events', 'different-orders'] as const)(
      '%s credits exactly the paid duration under overlap',
      async (scenario) => {
        const [user] = await db
          .insert(schema.users)
          .values({ email: `${randomUUID()}@example.invalid` })
          .returning();
        const a = await service.createCheckout({
          userId: user!.id,
          plan: 'monthly',
        });
        const b =
          scenario === 'different-orders'
            ? await service.createCheckout({
                userId: user!.id,
                plan: 'monthly',
              })
            : a;
        const eventA = {
          eventId: randomUUID(),
          eventType: 'checkout.paid',
          payload: {
            id: a.providerRef,
            status: 'paid',
            amount: a.finalCents / 100,
            currency: 'DZD',
          },
        };
        const eventB = {
          eventId: scenario === 'same-event' ? eventA.eventId : randomUUID(),
          eventType: 'checkout.paid',
          payload: {
            id: b.providerRef,
            status: 'paid',
            amount: b.finalCents / 100,
            currency: 'DZD',
          },
        };
        // Force both transactions to overlap: they block at the user lock until
        // the independent blocker releases it. max=4 permits all three clients.
        const blocker = await pool.connect();
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
          user!.id,
        ]);
        const start = Date.now();
        const work = Promise.all([
          service.handleChargilyWebhook(eventA),
          service.handleChargilyWebhook(eventB),
        ]);
        // Observe the promises immediately, including an unexpected early rejection.
        const completion = work.then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        try {
          let waiting = 0;
          const deadline = Date.now() + 5000;
          while (waiting < 2 && Date.now() < deadline) {
            const locks = await admin.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
              [namespace],
            );
            waiting = locks.rows[0].n;
            if (waiting < 2)
              await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(waiting).toBe(2);
        } finally {
          await blocker.query('COMMIT');
          blocker.release();
        }
        const result = await completion;
        if ('error' in result) throw result.error;
        const rows = await db
          .select()
          .from(schema.entitlements)
          .where(eq(schema.entitlements.userId, user!.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.plan).toBe('premium');
        const duration =
          (scenario === 'different-orders' ? 60 : 30) * 86_400_000;
        expect(rows[0]!.expiresAt!.getTime()).toBeGreaterThanOrEqual(
          start + duration,
        );
        expect(rows[0]!.expiresAt!.getTime()).toBeLessThanOrEqual(
          Date.now() + duration,
        );
      },
    );
    async function holdUntilBothWait(
      sql: string,
      params: unknown[],
      work: () => Promise<unknown>[],
    ) {
      const blocker = await pool.connect();
      await blocker.query('BEGIN');
      await blocker.query(sql, params);
      const completion = Promise.allSettled(work());
      try {
        let waiting = 0;
        const deadline = Date.now() + 5000;
        while (waiting < 2 && Date.now() < deadline) {
          const rows = await admin.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
            [namespace],
          );
          waiting = rows.rows[0].n;
          if (waiting < 2)
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(2);
      } finally {
        await blocker.query('COMMIT');
        blocker.release();
      }
      return completion;
    }

    it('two checkout requests competing for the last promo quota create one reservation', async () => {
      const code = randomUUID().toUpperCase();
      await db
        .insert(schema.promoCodes)
        .values({ code, discountPct: 20, planDurationDays: 30, maxUses: 1 });
      const members = await db
        .insert(schema.users)
        .values(
          Array.from({ length: 2 }, () => ({
            email: `${randomUUID()}@example.invalid`,
          })),
        )
        .returning();
      const results = await holdUntilBothWait(
        'SELECT code FROM promo_codes WHERE code=$1 FOR UPDATE',
        [code],
        () =>
          members.map((member) =>
            service.createCheckout({
              userId: member.id,
              plan: 'monthly',
              promoCode: code,
            }),
          ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(
        await db
          .select()
          .from(schema.paymentOrders)
          .where(eq(schema.paymentOrders.promoCode, code)),
      ).toHaveLength(1);
      expect(
        (
          await db
            .select()
            .from(schema.promoCodes)
            .where(eq(schema.promoCodes.code, code))
        )[0]!.usedCount,
      ).toBe(0);
    });

    it('two joins competing for the fifth place never overfill the group', async () => {
      const members = await db
        .insert(schema.users)
        .values(
          Array.from({ length: 6 }, () => ({
            email: `${randomUUID()}@example.invalid`,
          })),
        )
        .returning();
      const groups = new GroupPacksService(db);
      const pack = await groups.create({
        userId: members[0]!.id,
        body: { plan: 'yearly' },
      });
      for (const member of members.slice(1, 4))
        await groups.join({
          userId: member.id,
          body: { invite_code: pack.invite_code },
        });
      const results = await holdUntilBothWait(
        'SELECT id FROM group_packs WHERE id=$1 FOR UPDATE',
        [pack.id],
        () =>
          members
            .slice(4)
            .map((member) =>
              groups.join({
                userId: member.id,
                body: { invite_code: pack.invite_code },
              }),
            ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(
        await groups.get({ userId: members[0]!.id, packId: pack.id }),
      ).toMatchObject({ status: 'full', member_count: 5 });
    });
  },
);
