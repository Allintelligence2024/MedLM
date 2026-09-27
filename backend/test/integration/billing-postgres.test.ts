// Real migrations + real Drizzle/service; only external checkout creation is mocked.
// PGlite serializes transactions: this suite does NOT prove multi-connection locking.
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BillingController } from '../../src/billing/billing.controller';
import { JwtGuard } from '../../src/auth/jwt.guard';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { BillingService } from '../../src/billing/billing.service';
import { GroupPacksService } from '../../src/group-packs/group-packs.service';
import {
  ChargilyPayProvider,
  CheckoutRejectedError,
} from '../../src/billing/chargily.provider';
import { PromoCodeProvider } from '../../src/billing/promo-code.provider';
import {
  PLAN_DURATION_DAYS,
  PLANS,
  type PlanId,
} from '../../src/billing/billing.dto';
import { type Database } from '../../src/db/database.module';
import * as schema from '../../src/db/schema';

describe('Billing — PostgreSQL execution (PGlite)', () => {
  let app: INestApplication;
  const webhookSecret = randomBytes(32).toString('hex');
  let pg: PGlite;
  let db: Database;
  let billing: BillingService;
  let provider: ChargilyPayProvider;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    const dir = join(__dirname, '../../src/db/migrations');
    const journal = JSON.parse(
      readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
    );
    for (const entry of journal.entries) {
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8').replace(
        /CREATE EXTENSION IF NOT EXISTS pgcrypto;?/g,
        '',
      );
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) await pg.exec(statement);
      }
    }
    // Adapter typing only: no SQL builders or results are faked.
    db = drizzle(pg, { schema }) as unknown as Database;
    const config = new ConfigService({ CHARGILY_API_SECRET: webhookSecret });
    provider = new ChargilyPayProvider(config);
    vi.spyOn(provider, 'createPayment').mockImplementation(async (args) => ({
      url: 'https://example.invalid/checkout',
      providerRef: randomUUID(),
      amount_cents: args.amount_cents,
      currency: 'DZD',
    }));
    vi.spyOn(provider, 'retrieveCheckout').mockRejectedValue(
      new Error('no external API in SQL tests'),
    );
    billing = new BillingService(
      db,
      provider,
      new PromoCodeProvider(db),
      config,
    );
    // Real HTTP controller/rawBody/HMAC. Authenticated checkout isn't exercised
    // here; override its method guard to deny rather than fake authentication.
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: billing },
        { provide: ChargilyPayProvider, useValue: provider },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => false })
      .compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await pg?.close();
  });

  async function checkout(plan: PlanId = 'monthly', promoCode?: string) {
    const [user] = await db
      .insert(schema.users)
      .values({ email: `${randomUUID()}@example.invalid` })
      .returning();
    let groupPackId: string | undefined;
    if (plan === 'group') {
      const [pack] = await db
        .insert(schema.groupPacks)
        .values({
          coordinatorUserId: user!.id,
          plan: 'yearly',
          inviteCode: randomUUID(),
          status: 'full',
          perUserCents: 168000,
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();
      groupPackId = pack!.id;
      const members = await db
        .insert(schema.users)
        .values(
          Array.from({ length: 4 }, () => ({
            email: `${randomUUID()}@example.invalid`,
          })),
        )
        .returning();
      await db
        .insert(schema.groupPackMembers)
        .values(
          [user!, ...members].map((m) => ({
            packId: groupPackId!,
            userId: m.id,
          })),
        );
    }
    const result = await billing.createCheckout({
      userId: user!.id,
      plan,
      ...(groupPackId ? { groupPackId } : {}),
      ...(promoCode ? { promoCode } : {}),
    });
    return { ...result, userId: user!.id };
  }

  function paid(
    order: { providerRef: string; finalCents: number },
    overrides = {},
  ) {
    return {
      eventId: randomUUID(),
      eventType: 'checkout.paid',
      payload: {
        id: order.providerRef,
        status: 'paid',
        amount: order.finalCents / 100,
        currency: 'DZD',
        ...overrides,
      },
    };
  }

  async function entitlement(userId: string) {
    return db
      .select()
      .from(schema.entitlements)
      .where(eq(schema.entitlements.userId, userId));
  }

  it.each(PLANS)(
    '%s credits premium, never the commercial SKU',
    async (plan) => {
      const order = await checkout(plan);
      const before = Date.now();
      await billing.handleChargilyWebhook(paid(order));
      const rows = await entitlement(order.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.plan).toBe('premium');
      const duration = PLAN_DURATION_DAYS[plan] * 86_400_000;
      expect(rows[0]!.expiresAt!.getTime()).toBeGreaterThanOrEqual(
        before + duration,
      );
      expect(rows[0]!.expiresAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + duration,
      );
      expect((await billing.currentEntitlement(order.userId)).plan).toBe(
        'premium',
      );
    },
  );

  it('preserves the promo amount and duration agreed at checkout', async () => {
    const code = randomUUID().toUpperCase();
    await db
      .insert(schema.promoCodes)
      .values({ code, discountPct: 50, planDurationDays: 45, maxUses: 10 });
    const order = await checkout('yearly', code);
    expect(order.finalCents).toBe(120000);
    // Editing the promotion later cannot alter the existing contract.
    await db
      .update(schema.promoCodes)
      .set({ planDurationDays: 90 })
      .where(eq(schema.promoCodes.code, code));
    const before = Date.now();
    await billing.handleChargilyWebhook(
      paid(order, {
        metadata: {
          user_id: randomUUID(),
          plan: 'group',
          durationDays: '99999',
        },
      }),
    );
    const rows = await entitlement(order.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.plan).toBe('premium');
    expect(rows[0]!.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + 45 * 86_400_000,
    );
    expect(rows[0]!.expiresAt!.getTime()).toBeLessThanOrEqual(
      Date.now() + 45 * 86_400_000,
    );
  });

  it('replays of the event AND different events for the same order do not extend twice', async () => {
    const order = await checkout();
    const event = paid(order);
    await billing.handleChargilyWebhook(event);
    const first = (await entitlement(order.userId))[0]!.expiresAt;
    expect((await billing.handleChargilyWebhook(event)).reason).toBe(
      'already_seen',
    );
    await billing.handleChargilyWebhook(paid(order));
    const rows = await entitlement(order.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.expiresAt).toEqual(first);
  });

  it('two distinct purchases extend the same premium tier', async () => {
    const order = await checkout();
    await billing.handleChargilyWebhook(paid(order));
    const first = (await entitlement(order.userId))[0]!.expiresAt!.getTime();
    const next = await billing.createCheckout({
      userId: order.userId,
      plan: 'yearly',
    });
    await billing.handleChargilyWebhook(paid(next));
    const rows = await entitlement(order.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.expiresAt!.getTime()).toBe(first + 365 * 86_400_000);
  });

  it.each([
    { amount: undefined },
    { amount: '35000' },
    { amount: 0 },
    { amount: -1 },
    { amount: 35000.5 },
    { amount: 1 },
    { currency: undefined },
    { currency: 'EUR' },
    { currency: 42 },
    { id: undefined },
  ])(
    'rejects missing/invalid/mismatched signed payment fields: %j',
    async (override) => {
      const order = await checkout();
      const event = paid(order, override);
      await expect(billing.handleChargilyWebhook(event)).rejects.toThrow();
      expect(await entitlement(order.userId)).toHaveLength(0);
      expect(
        await db
          .select()
          .from(schema.webhookEvents)
          .where(eq(schema.webhookEvents.eventId, event.eventId)),
      ).toHaveLength(0);
      const [stored] = await db
        .select()
        .from(schema.paymentOrders)
        .where(eq(schema.paymentOrders.providerRef, order.providerRef));
      expect(stored!.status).toBe('pending');
    },
  );

  it('accepts provider lowercase currency without trusting metadata', async () => {
    const order = await checkout();
    await billing.handleChargilyWebhook(paid(order, { currency: 'dzd' }));
    expect(await entitlement(order.userId)).toHaveLength(1);
  });

  it.each(['failed', 'canceled'])(
    'does not credit an order in state %s',
    async (status) => {
      const order = await checkout();
      await db
        .update(schema.paymentOrders)
        .set({ status })
        .where(eq(schema.paymentOrders.providerRef, order.providerRef));
      await expect(billing.handleChargilyWebhook(paid(order))).rejects.toThrow(
        'commande non payable',
      );
      expect(await entitlement(order.userId)).toHaveLength(0);
    },
  );

  it('does not credit an unconfirmed event', async () => {
    const order = await checkout();
    await billing.handleChargilyWebhook({
      ...paid(order),
      eventType: 'checkout.failed',
    });
    expect(await entitlement(order.userId)).toHaveLength(0);
    // A later paid event has its own ID and can still be reconciled.
    await billing.handleChargilyWebhook(paid(order));
    expect(await entitlement(order.userId)).toHaveLength(1);
  });

  it('an early webhook can be retried after the provider reference is persisted', async () => {
    const order = await checkout();
    const [stored] = await db
      .select()
      .from(schema.paymentOrders)
      .where(eq(schema.paymentOrders.providerRef, order.providerRef));
    await db
      .update(schema.paymentOrders)
      .set({ providerRef: null })
      .where(eq(schema.paymentOrders.id, stored!.id));
    const event = paid(order, { metadata: { order_id: stored!.id } });
    await expect(billing.handleChargilyWebhook(event)).rejects.toMatchObject({
      status: 503,
    });
    expect(await entitlement(order.userId)).toHaveLength(0);
    await db
      .update(schema.paymentOrders)
      .set({ providerRef: order.providerRef })
      .where(eq(schema.paymentOrders.id, stored!.id));
    await billing.handleChargilyWebhook(event);
    expect(await entitlement(order.userId)).toHaveLength(1);
  });

  it('legacy duration is not guessed; reconciliation allows the same event to retry', async () => {
    const order = await checkout();
    await db
      .update(schema.paymentOrders)
      .set({ durationDays: null })
      .where(eq(schema.paymentOrders.providerRef, order.providerRef));
    const event = paid(order);
    await expect(billing.handleChargilyWebhook(event)).rejects.toMatchObject({
      status: 503,
    });
    await db
      .update(schema.paymentOrders)
      .set({ durationDays: 20 })
      .where(eq(schema.paymentOrders.providerRef, order.providerRef));
    await billing.handleChargilyWebhook(event);
    expect(await entitlement(order.userId)).toHaveLength(1);
  });

  it('rolls back the event claim and order if crediting fails', async () => {
    const order = await checkout();
    const event = paid(order);
    const fault = vi
      .spyOn(billing as any, 'creditEntitlement')
      .mockRejectedValueOnce(new Error('injected credit failure'));
    try {
      await expect(billing.handleChargilyWebhook(event)).rejects.toThrow(
        'injected credit failure',
      );
    } finally {
      fault.mockRestore();
    }
    expect(
      await db
        .select()
        .from(schema.webhookEvents)
        .where(eq(schema.webhookEvents.eventId, event.eventId)),
    ).toHaveLength(0);
    const [stored] = await db
      .select()
      .from(schema.paymentOrders)
      .where(eq(schema.paymentOrders.providerRef, order.providerRef));
    expect(stored!.status).toBe('pending');
    await billing.handleChargilyWebhook(event);
    expect(await entitlement(order.userId)).toHaveLength(1);
  });

  it('HTTP raw-body HMAC grants premium exactly once and rejects an unsigned event', async () => {
    const order = await checkout();
    const event = paid(order);
    const raw = JSON.stringify({
      id: event.eventId,
      type: event.eventType,
      data: event.payload,
    });
    await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(403);
    expect(await entitlement(order.userId)).toHaveLength(0);
    const signature = createHmac('sha256', webhookSecret)
      .update(raw)
      .digest('hex');
    await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .set('Content-Type', 'application/json')
      .set('signature', signature)
      .send(raw)
      .expect(200, { processed: true });
    const initial = (await entitlement(order.userId))[0]!.expiresAt;
    await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .set('Content-Type', 'application/json')
      .set('signature', signature)
      .send(raw)
      .expect(200, { processed: true, reason: 'already_seen' });
    expect((await entitlement(order.userId))[0]!.expiresAt).toEqual(initial);
  });

  it('HTTP signed but incomplete payment fails closed without granting rights', async () => {
    const order = await checkout();
    const raw = JSON.stringify({
      id: randomUUID(),
      type: 'checkout.paid',
      data: { id: order.providerRef, currency: 'DZD' },
    });
    await request(app.getHttpServer())
      .post('/v1/billing/webhook/chargily')
      .set('Content-Type', 'application/json')
      .set(
        'signature',
        createHmac('sha256', webhookSecret).update(raw).digest('hex'),
      )
      .send(raw)
      .expect(400);
    expect(await entitlement(order.userId)).toHaveLength(0);
  });

  it('a free row with a future expiry is not an active premium right', async () => {
    const order = await checkout();
    await db
      .insert(schema.entitlements)
      .values({
        userId: order.userId,
        plan: 'free',
        expiresAt: new Date(Date.now() + 86400_000),
      });
    expect(await billing.currentEntitlement(order.userId)).toMatchObject({
      plan: 'free',
      isActive: false,
    });
  });
  async function storedOrder(ref: string) {
    return (
      await db
        .select()
        .from(schema.paymentOrders)
        .where(eq(schema.paymentOrders.providerRef, ref))
    )[0]!;
  }
  async function newUser(rbacRole = 'student') {
    return (
      await db
        .insert(schema.users)
        .values({ email: `${randomUUID()}@example.invalid`, rbacRole })
        .returning()
    )[0]!;
  }
  async function promotion() {
    const code = randomUUID().toUpperCase();
    await db
      .insert(schema.promoCodes)
      .values({ code, discountPct: 15, planDurationDays: 37, maxUses: 1 });
    return code;
  }

  it('reserves the last promo slot; consumption occurs exactly once on paid', async () => {
    const code = await promotion();
    const a = await checkout('monthly', code);
    expect(a.finalCents).toBe(29800); // 297.5 DA rounded to a whole dinar, before payment.
    expect(
      (
        await db
          .select()
          .from(schema.promoCodes)
          .where(eq(schema.promoCodes.code, code))
      )[0]!.usedCount,
    ).toBe(0);
    await expect(checkout('monthly', code)).rejects.toThrow('réservé');
    await billing.handleChargilyWebhook(paid(a));
    await billing.handleChargilyWebhook(paid(a));
    expect(
      (
        await db
          .select()
          .from(schema.promoCodes)
          .where(eq(schema.promoCodes.code, code))
      )[0]!.usedCount,
    ).toBe(1);
    await expect(checkout('monthly', code)).rejects.toThrow('épuisé');
  });

  it('retains a reservation on uncertain checkout creation; definitive rejection releases it', async () => {
    const code = await promotion();
    vi.mocked(provider.createPayment).mockRejectedValueOnce(
      new Error('network timeout'),
    );
    await expect(checkout('monthly', code)).rejects.toMatchObject({
      status: 503,
    });
    await expect(checkout('monthly', code)).rejects.toThrow('réservé');
    const another = await promotion();
    vi.mocked(provider.createPayment).mockRejectedValueOnce(
      new CheckoutRejectedError('HTTP 422'),
    );
    await expect(checkout('monthly', another)).rejects.toMatchObject({
      status: 503,
    });
    await expect(checkout('monthly', another)).resolves.toHaveProperty(
      'providerRef',
    );
  });

  it('requires a full group and its coordinator; freezes five beneficiaries and credits all atomically', async () => {
    const groups = new GroupPacksService(db);
    const owner = await newUser();
    const pack = await groups.create({
      userId: owner.id,
      body: { plan: 'monthly' },
    });
    expect(pack.member_count).toBe(1);
    await expect(
      billing.createCheckout({
        userId: owner.id,
        plan: 'group',
        groupPackId: pack.id,
      }),
    ).rejects.toThrow('incomplet');
    const guests = await Promise.all(
      Array.from({ length: 4 }, () => newUser()),
    );
    for (const guest of guests)
      await groups.join({
        userId: guest.id,
        body: { invite_code: pack.invite_code },
      });
    expect(
      (await groups.get({ packId: pack.id, userId: owner.id })).member_count,
    ).toBe(5);
    const outsider = await newUser();
    await expect(
      groups.get({ packId: pack.id, userId: outsider.id }),
    ).rejects.toThrow('introuvable');
    await expect(
      groups.join({
        userId: outsider.id,
        body: { invite_code: pack.invite_code },
      }),
    ).rejects.toThrow();
    await expect(
      billing.createCheckout({
        userId: guests[0]!.id,
        plan: 'group',
        groupPackId: pack.id,
      }),
    ).rejects.toThrow('coordinateur');
    const checkout = await billing.createCheckout({
      userId: owner.id,
      plan: 'group',
      groupPackId: pack.id,
    });
    expect(checkout.finalCents).toBe(122500);
    await expect(
      billing.createCheckout({
        userId: owner.id,
        plan: 'group',
        groupPackId: pack.id,
      }),
    ).rejects.toThrow('déjà engagé');
    const order = await storedOrder(checkout.providerRef);
    expect(
      await db
        .select()
        .from(schema.paymentOrderBeneficiaries)
        .where(eq(schema.paymentOrderBeneficiaries.orderId, order.id)),
    ).toHaveLength(5);
    // Pack expiry after checkout cannot undo the frozen paid contract.
    await db
      .update(schema.groupPacks)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.groupPacks.id, pack.id));
    const fault = vi.spyOn(billing as any, 'creditEntitlement');
    // Inject a failure on the second credit after the first has executed in SQL.
    let count = 0;
    const original = (BillingService.prototype as any).creditEntitlement;
    fault.mockImplementation(async (...args: any[]) => {
      if (++count === 2) throw new Error('second credit fails');
      return original.apply(billing, args);
    });
    try {
      await expect(
        billing.handleChargilyWebhook(paid(checkout)),
      ).rejects.toThrow('second credit');
    } finally {
      fault.mockRestore();
    }
    for (const member of [owner, ...guests])
      expect(await entitlement(member.id)).toHaveLength(0);
    await billing.handleChargilyWebhook(paid(checkout));
    await billing.handleChargilyWebhook(paid(checkout));
    for (const member of [owner, ...guests]) {
      const rights = await entitlement(member.id);
      expect(rights).toHaveLength(1);
      expect(rights[0]!.expiresAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + 30 * 86400000,
      );
    }
    expect(
      (await groups.get({ packId: pack.id, userId: owner.id })).status,
    ).toBe('paid');
  });

  it('rejects group SKU without an explicit pack and legacy unit interpretation', async () => {
    const user = await newUser();
    await expect(
      billing.createCheckout({ userId: user.id, plan: 'group' }),
    ).rejects.toThrow('group_pack_id');
    const order = await checkout();
    await db
      .update(schema.paymentOrders)
      .set({ contractVersion: 1 })
      .where(eq(schema.paymentOrders.providerRef, order.providerRef));
    await expect(billing.handleChargilyWebhook(paid(order))).rejects.toThrow(
      'historique',
    );
    expect(await entitlement(order.userId)).toHaveLength(0);
  });

  it('reconciles an unbound checkout only from authenticated provider evidence, with an audit record', async () => {
    const admin = await newUser('admin');
    const order = await checkout();
    const row = await storedOrder(order.providerRef);
    await db
      .update(schema.paymentOrders)
      .set({ providerRef: null })
      .where(eq(schema.paymentOrders.id, row.id));
    const remote = vi
      .spyOn(provider, 'retrieveCheckout')
      .mockResolvedValue({
        id: order.providerRef,
        status: 'paid',
        amount: order.finalCents / 100,
        currency: 'DZD',
        metadata: { order_id: row.id },
      });
    try {
      await expect(
        billing.reconcile({
          actorUserId: order.userId,
          orderId: row.id,
          providerRef: order.providerRef,
          reason: 'recover timeout',
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(remote).not.toHaveBeenCalled();
      await billing.reconcile({
        actorUserId: admin.id,
        orderId: row.id,
        providerRef: order.providerRef,
        reason: 'recover timeout',
      });
      await billing.reconcile({
        actorUserId: admin.id,
        orderId: row.id,
        reason: 'verify recovery',
      });
      expect(await entitlement(order.userId)).toHaveLength(1);
      expect(
        await db
          .select()
          .from(schema.auditLog)
          .where(eq(schema.auditLog.targetId, row.id)),
      ).toHaveLength(2);
    } finally {
      remote.mockRestore();
    }
  });

  it('rejects unbound reconciliation with metadata belonging to another order', async () => {
    const admin = await newUser('admin');
    const order = await checkout();
    const row = await storedOrder(order.providerRef);
    await db
      .update(schema.paymentOrders)
      .set({ providerRef: null })
      .where(eq(schema.paymentOrders.id, row.id));
    const remote = vi
      .spyOn(provider, 'retrieveCheckout')
      .mockResolvedValue({
        id: order.providerRef,
        status: 'paid',
        amount: order.finalCents / 100,
        currency: 'DZD',
        metadata: { order_id: randomUUID() },
      });
    try {
      await expect(
        billing.reconcile({
          actorUserId: admin.id,
          orderId: row.id,
          providerRef: order.providerRef,
          reason: 'recover timeout',
        }),
      ).rejects.toThrow('liaison');
    } finally {
      remote.mockRestore();
    }
    expect(await entitlement(order.userId)).toHaveLength(0);
  });

  it('releases abandoned promo reservations only after remote terminal-state reconciliation', async () => {
    const admin = await newUser('admin');
    const code = await promotion();
    const order = await checkout('monthly', code);
    const row = await storedOrder(order.providerRef);
    const remote = vi
      .spyOn(provider, 'retrieveCheckout')
      .mockResolvedValue({
        id: order.providerRef,
        status: 'expired',
        amount: order.finalCents / 100,
        currency: 'DZD',
      });
    try {
      await billing.reconcile({
        actorUserId: admin.id,
        orderId: row.id,
        reason: 'release expired checkout',
      });
    } finally {
      remote.mockRestore();
    }
    expect((await storedOrder(order.providerRef)).status).toBe('expired');
    await expect(checkout('monthly', code)).resolves.toHaveProperty(
      'providerRef',
    );
  });

  it('obtains missing webhook currency from GET; a pending remote checkout never credits', async () => {
    const order = await checkout();
    const remote = vi
      .spyOn(provider, 'retrieveCheckout')
      .mockResolvedValue({
        id: order.providerRef,
        status: 'pending',
        amount: order.finalCents / 100,
        currency: 'DZD',
      });
    try {
      await expect(
        billing.handleChargilyWebhook(paid(order, { currency: undefined })),
      ).rejects.toThrow();
      expect(await entitlement(order.userId)).toHaveLength(0);
      remote.mockResolvedValue({
        id: order.providerRef,
        status: 'paid',
        amount: order.finalCents / 100,
        currency: 'DZD',
      });
      await billing.handleChargilyWebhook(paid(order, { currency: undefined }));
      expect(await entitlement(order.userId)).toHaveLength(1);
    } finally {
      remote.mockRestore();
    }
  });
});
