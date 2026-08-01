// Tests Phase 7 — BillingService.
//
// On teste la logique de résolution de promo et d'attribution
// d'entitlement. Pas d'appels HTTP réels à Chargily (testés séparément
// via un mock de fetch).
import { describe, it, expect, beforeEach } from 'vitest';
import { BillingService } from '../../src/billing/billing.service';
import { PromoCodeProvider } from '../../src/billing/promo-code.provider';
import { ChargilyPayProvider } from '../../src/billing/chargily.provider';
import { users } from '../../src/db/schema/users';
import { webhookEvents } from '../../src/db/schema/billing';

class FakeDb {
  entitlements: any[] = [];
  webhookEvents: any[] = [];
  userEmail = 'alice@medanki.dz';

  transaction = async (fn: (tx: FakeDb) => Promise<unknown>) => fn(this);
  select(): any {
    const self = this;
    return {
      from(t: any) {
        const rows =
          t === users
            ? [{ email: self.userEmail }]
            : t === webhookEvents
              ? self.webhookEvents
              : self.entitlements;
        return {
          where(_w: any) {
            // Drizzle réel : le builder est thenable (await → rows[]).
            const p = Promise.resolve(rows);
            return {
              then(res: any) {
                return p.then(res);
              },
              orderBy() {
                return {
                  then(res: any) {
                    return p.then(res);
                  },
                };
              },
            };
          },
        };
      },
    };
  }
  insert(_t: any): any {
    const self = this;
    return {
      values(v: any) {
        const done = Promise.resolve().then(() => self.webhookEvents.push(v));
        return {
          then(res: any) {
            return done.then(res);
          },
          onConflictDoUpdate() {
            self.entitlements.push(v);
            return this;
          },
        };
      },
    };
  }
  update(): any {
    return { set() { return { where() { return this; } }; } };
  }
}

class FakeChargily {
  createPayment = async (args: any) => ({
    url: 'https://pay.chargily.com/x',
    providerRef: 'co_test',
    amount_cents: args.amount_cents,
    currency: 'DZD' as const,
  });
  handleWebhook = async (args: any) => {
    if (args.eventType === 'checkout.paid') {
      return { confirmed: true, providerRef: 'co_paid' };
    }
    return { confirmed: false, providerRef: 'co_other', reason: 'unknown' };
  };
}

class FakePromo {
  resolve = async (args: { code: string; plan: string; baseCents: number }) => ({
    baseCents: args.baseCents,
    discountPct: 50,
    finalCents: Math.round(args.baseCents * 0.5),
    code: args.code,
    durationDays: 180,
  });
}

describe('BillingService', () => {
  let db: FakeDb;
  let service: BillingService;
  const config = { get: (_k: string) => undefined } as any;

  beforeEach(() => {
    db = new FakeDb();
    service = new BillingService(db as any, new FakeChargily() as any, new FakePromo() as any, config);
  });

  it('crée un checkout sans promo', async () => {
    const out = await service.createCheckout({
      userId: 'u1',
      plan: 'yearly',
    });
    expect(out.url).toContain('chargily.com');
    expect(out.finalCents).toBe(2400 * 100);
  });

  it('applique une promo et réduit le montant', async () => {
    const out = await service.createCheckout({
      userId: 'u1',
      plan: 'yearly',
      promoCode: 'boursier2026',
    });
    expect(out.finalCents).toBe(2400 * 100 * 0.5);
  });

  it('refuse un plan inconnu', async () => {
    await expect(
      service.createCheckout({ userId: 'u1', plan: 'unknown' as any }),
    ).rejects.toThrow(/plan inconnu/);
  });

  it('traite un webhook checkout.paid comme confirmé', async () => {
    const r = await service.handleChargilyWebhook({
      eventId: 'evt_1',
      eventType: 'checkout.paid',
      payload: {
        id: 'co_1',
        metadata: { user_id: 'u1', plan: 'yearly', durationDays: '365' },
      },
    });
    expect(r.processed).toBe(true);
  });

  it('déduplique un webhook déjà vu', async () => {
    db.webhookEvents.push({ eventId: 'evt_1' });
    const r = await service.handleChargilyWebhook({
      eventId: 'evt_1',
      eventType: 'checkout.paid',
      payload: {},
    });
    expect(r.reason).toBe('already_seen');
  });
});

describe('PromoCodeProvider', () => {
  it('rejette un code inconnu', async () => {
    const db: any = {
      // Thenable comme le drizzle réel : await → rows[] (ici : aucun
      // code promo connu → liste vide → « inconnu »).
      select: () => ({
        from: () => ({
          where: () => ({ then: (cb: any) => Promise.resolve([]).then(cb) }),
        }),
      }),
      transaction: async (fn: any) => fn(db),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    };
    const p = new PromoCodeProvider(db as any);
    await expect(
      p.resolve({ code: 'INEXISTANT', plan: 'yearly', baseCents: 240000 }),
    ).rejects.toThrow(/inconnu/);
  });
});

describe('ChargilyPayProvider.verifyWebhookSignature', () => {
  it('rejette un body non signé', () => {
    const p = new ChargilyPayProvider({ get: () => 'dummy' } as any);
    // apiSecret = 'dummy' (4 bytes) — le HMAC donnera un hex de 8 chars.
    expect(p.verifyWebhookSignature('{"a":1}', null)).toBe(false);
    expect(p.verifyWebhookSignature('{"a":1}', '00')).toBe(false);
  });
});
