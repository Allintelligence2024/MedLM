// Tests ChargilyPayProvider (Phase 16.2 — production hardening).
import { describe, it, expect } from 'vitest';
import { ChargilyPayProvider } from '../../src/billing/chargily.provider';

const baseConfig = (env: Record<string, string | number | undefined>) => ({
  get: (k: string) => env[k] as string | undefined,
});

describe('ChargilyPayProvider — configuration', () => {
  it('refuse de démarrer en prod sans clé API', () => {
    expect(() => {
      new ChargilyPayProvider(
        baseConfig({
          CHARGILY_ENV: 'production',
          CHARGILY_API_KEY: undefined,
          CHARGILY_API_SECRET: 'sec',
        }) as any,
      );
    }).toThrow(/CHARGILY_API_KEY obligatoire/);
  });

  it('refuse prod + dry_run', () => {
    expect(() => {
      new ChargilyPayProvider(
        baseConfig({
          CHARGILY_ENV: 'production',
          CHARGILY_DRY_RUN: 'true',
          CHARGILY_API_KEY: 'key',
        }) as any,
      );
    }).toThrow(/Incohérence/);
  });

  it('accepte sandbox + dry_run', () => {
    expect(() => {
      new ChargilyPayProvider(
        baseConfig({
          CHARGILY_ENV: 'sandbox',
          CHARGILY_DRY_RUN: 'true',
        }) as any,
      );
    }).not.toThrow();
  });

  it('accepte prod + clé valide', () => {
    expect(() => {
      new ChargilyPayProvider(
        baseConfig({
          CHARGILY_ENV: 'production',
          CHARGILY_API_KEY: 'pk_live_xxx',
        }) as any,
      );
    }).not.toThrow();
  });
});

describe('ChargilyPayProvider — defaultBaseUrl', () => {
  it('sandbox = test endpoint', () => {
    const p = new ChargilyPayProvider(
      baseConfig({ CHARGILY_ENV: 'sandbox' }) as any,
    );
    expect((p as any)._defaultBaseUrl('sandbox')).toContain('test/api/v2');
  });

  it('production = live endpoint', () => {
    // La construction en prod exige une clé (fail-closed, testé plus
    // haut) — on passe une clé factice pour isoler le test d'URL.
    const p = new ChargilyPayProvider(
      baseConfig({
        CHARGILY_ENV: 'production',
        CHARGILY_API_KEY: 'pk_live_factice',
      }) as any,
    );
    expect((p as any)._defaultBaseUrl('production')).toContain('/api/v2');
    expect((p as any)._defaultBaseUrl('production')).not.toContain('test');
  });
});

describe('ChargilyPayProvider — healthCheck', () => {
  it('mode dry_run = ok immédiat', async () => {
    const p = new ChargilyPayProvider(
      baseConfig({
        CHARGILY_ENV: 'sandbox',
        CHARGILY_DRY_RUN: 'true',
      }) as any,
    );
    const h = await p.healthCheck();
    expect(h.ok).toBe(true);
    expect(h.mode).toBe('dry_run');
  });

  it('mode disabled (pas de clé) = ok:false', async () => {
    const p = new ChargilyPayProvider(
      baseConfig({ CHARGILY_ENV: 'sandbox' }) as any,
    );
    const h = await p.healthCheck();
    expect(h.ok).toBe(false);
    expect(h.reason).toContain('CHARGILY_API_KEY');
  });
});

describe('ChargilyPayProvider — verifyWebhookSignature', () => {
  it('refuse si pas de secret', () => {
    const p = new ChargilyPayProvider(
      baseConfig({ CHARGILY_ENV: 'sandbox' }) as any,
    );
    expect(p.verifyWebhookSignature('body', 'sig')).toBe(false);
  });

  it('refuse si pas de signature', () => {
    const p = new ChargilyPayProvider(
      baseConfig({
        CHARGILY_ENV: 'sandbox',
        CHARGILY_API_SECRET: 'sec',
      }) as any,
    );
    expect(p.verifyWebhookSignature('body', null)).toBe(false);
  });

  it('accepte une signature HMAC-SHA256 valide', () => {
    // Calcule la signature attendue.
    const crypto = require('node:crypto');
    const secret = 'test-secret';
    const body = '{"event":"test"}';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const p = new ChargilyPayProvider(
      baseConfig({
        CHARGILY_ENV: 'sandbox',
        CHARGILY_API_SECRET: secret,
      }) as any,
    );
    expect(p.verifyWebhookSignature(body, sig)).toBe(true);
  });

  it('rejette une signature invalide', () => {
    const p = new ChargilyPayProvider(
      baseConfig({
        CHARGILY_ENV: 'sandbox',
        CHARGILY_API_SECRET: 'sec',
      }) as any,
    );
    expect(p.verifyWebhookSignature('body', 'invalid-sig')).toBe(false);
  });
});

describe('ChargilyPayProvider — handleWebhook', () => {
  it('checkout.paid → confirmed', async () => {
    const p = new ChargilyPayProvider(
      baseConfig({ CHARGILY_ENV: 'sandbox' }) as any,
    );
    const r = await p.handleWebhook({
      eventId: 'e1',
      eventType: 'checkout.paid',
      payload: { id: 'co_1', status: 'paid' },
      signature: null,
    });
    expect(r.confirmed).toBe(true);
    expect(r.providerRef).toBe('co_1');
  });

  it('checkout.failed → not confirmed', async () => {
    const p = new ChargilyPayProvider(
      baseConfig({ CHARGILY_ENV: 'sandbox' }) as any,
    );
    const r = await p.handleWebhook({
      eventId: 'e2',
      eventType: 'checkout.failed',
      payload: { id: 'co_2' },
      signature: null,
    });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe('checkout_failed');
  });

  it('event inconnu → not confirmed + reason explicite', async () => {
    const p = new ChargilyPayProvider(
      baseConfig({ CHARGILY_ENV: 'sandbox' }) as any,
    );
    const r = await p.handleWebhook({
      eventId: 'e3',
      eventType: 'mystery.event',
      payload: {},
      signature: null,
    });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toContain('unknown_event');
  });
});
