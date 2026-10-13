// Wire fixtures based on Chargily v2 documentation, NOT live sandbox certification.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ChargilyPayProvider } from '../../src/billing/chargily.provider';
const provider = () =>
  new ChargilyPayProvider(
    new ConfigService({
      CHARGILY_API_SECRET: 'test-only-secret',
      CHARGILY_MAX_RETRIES: 0,
    }),
  );
const args = {
  userId: 'u',
  userEmail: 'u@example.invalid',
  plan: 'monthly',
  amount_cents: 35000,
};
afterEach(() => vi.unstubAllGlobals());
describe('Chargily v2 wire contract', () => {
  it('sends 350 dinars, secret-key auth and failure_url; validates returned quote', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'c1',
            checkout_url: 'https://pay.chargily.dz/checkout/c1',
            status: 'pending',
            currency: 'dzd',
            amount: 350,
            livemode: false,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await provider().createPayment(args)).toMatchObject({
      providerRef: 'c1',
      amount_cents: 35000,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://pay.chargily.net/test/api/v2/checkouts');
    expect(init.headers.Authorization).toBe('Bearer test-only-secret');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      amount: 350,
      currency: 'dzd',
      failure_url: 'https://medanki.dz/billing/cancel',
    });
    expect(body).not.toHaveProperty('cancel_url');
    expect(body).not.toHaveProperty('customer_email');
  });
  it.each(['network', 'http500'])(
    'never retries checkout POST after %s',
    async (failure) => {
      const fetcher =
        failure === 'network'
          ? vi.fn().mockRejectedValue(new Error('network'))
          : vi.fn().mockResolvedValue(new Response('', { status: 500 }));
      vi.stubGlobal('fetch', fetcher);
      const p = new ChargilyPayProvider(
        new ConfigService({
          CHARGILY_API_SECRET: 'test-only',
          CHARGILY_MAX_RETRIES: 3,
        }),
      );
      await expect(p.createPayment(args)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { amount: 35000 },
    { currency: 'EUR' },
    { livemode: true },
    { checkout_url: 'https://attacker.invalid/pay' },
    { status: 'paid' },
  ])('rejects inconsistent response %j', async (overrides) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              id: 'c',
              status: 'pending',
              amount: 350,
              currency: 'dzd',
              checkout_url: 'https://pay.chargily.dz/c',
              ...overrides,
            }),
          ),
        ),
    );
    await expect(provider().createPayment(args)).rejects.toThrow();
  });
  it('rejects fractional dinars and arbitrary redirect origins before any request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      provider().createPayment({ ...args, amount_cents: 35050 }),
    ).rejects.toThrow();
    await expect(
      provider().createPayment({
        ...args,
        successUrl: 'https://attacker.invalid/',
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retrieves a checkout using authenticated GET; refunds are not fabricated', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'c1',
            status: 'paid',
            amount: 350,
            currency: 'dzd',
          }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    expect((await provider().retrieveCheckout('c1')).status).toBe('paid');
    expect(fetcher.mock.calls[0]![1].method).toBe('GET');
    expect((await provider().refund('c1')).ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
