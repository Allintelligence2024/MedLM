import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EntitlementService } from '../../src/entitlement/entitlement.service';
import { type BillingService } from '../../src/billing/billing.service';

describe('Entitlement JWT — RS256 verification contract', () => {
  let directory: string;
  let privateKey: string;
  let jwt: JwtService;
  let service: EntitlementService;

  beforeAll(() => {
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    privateKey = keys.privateKey;
    directory = mkdtempSync(join(tmpdir(), 'medlm-entitlement-'));
    writeFileSync(join(directory, 'private.pem'), privateKey, { mode: 0o600 });
    jwt = new JwtService({ privateKey, signOptions: { algorithm: 'RS256' } });
    const billing = {
      currentEntitlement: async () => ({
        plan: 'premium',
        isActive: true,
        expiresAtMs: Date.now() + 86400_000,
        graceUntilMs: Date.now() + 15 * 86400_000,
      }),
    };
    service = new EntitlementService(
      jwt,
      billing as unknown as BillingService,
      new ConfigService({
        NODE_ENV: 'production',
        JWT_SIGNING_KEY_PATH: join(directory, 'private.pem'),
      }),
    );
  });

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('derives the public key from the configured signing key', async () => {
    const issued = await service.issue('user-1', 'device-1');
    const verified = await service.verify(issued.jwt);
    expect(verified.user_id).toBe('user-1');
    expect(verified.plan).toBe('premium');
  });

  it('rejects an HS256 token even when its claims look valid', async () => {
    const symmetric = new JwtService({ secret: 'local-unit-test-only' });
    const issued = await service.issue('user-1', 'device-1');
    const token = await symmetric.signAsync(
      jwt.decode<Record<string, unknown>>(issued.jwt),
      { algorithm: 'HS256' },
    );
    await expect(service.verify(token)).rejects.toThrow(
      'jeton entitlement invalide',
    );
  });

  it('rejects an access token signed by the same RSA key', async () => {
    const token = await jwt.signAsync(
      { kind: 'access', sub: 'user-1' },
      { expiresIn: 60 },
    );
    await expect(service.verify(token)).rejects.toThrow(
      'jeton entitlement invalide',
    );
  });

  it('rejects an expired entitlement and an entitlement without exp', async () => {
    const issued = await service.issue('user-1', 'device-1');
    const payload = jwt.decode(issued.jwt) as Record<string, unknown>;
    delete payload['exp'];
    delete payload['iat'];
    await expect(service.verify(await jwt.signAsync(payload))).rejects.toThrow(
      'jeton entitlement invalide',
    );
    await expect(
      service.verify(await jwt.signAsync(payload, { expiresIn: -1 })),
    ).rejects.toThrow('jeton entitlement invalide');
  });

  it('fails closed in production if no verification key can be resolved', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', '');
    vi.stubEnv('JWT_SIGNING_KEY_PATH', '');
    try {
      expect(
        () =>
          new EntitlementService(
            jwt,
            {} as BillingService,
            new ConfigService(),
          ),
      ).toThrow('non dérivable');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('never falls back to HS256 in development either', async () => {
    const unconfigured = new EntitlementService(
      new JwtService({ secret: 'local-unit-test-only' }),
      {} as BillingService,
      new ConfigService({ NODE_ENV: 'test' }),
    );
    await expect(unconfigured.verify('irrelevant')).rejects.toThrow(
      'RS256 indisponible',
    );
  });

  it('treats an environment TTL as seconds, not the JWT library millisecond string format', async () => {
    vi.stubEnv('JWT_ENTITLEMENT_TTL_SECONDS', '3600');
    try {
      const timed = new EntitlementService(
        jwt,
        {
          currentEntitlement: async () => ({
            plan: 'free',
            isActive: false,
            expiresAtMs: 0,
            graceUntilMs: 0,
          }),
        } as unknown as BillingService,
        new ConfigService({
          JWT_SIGNING_KEY_PATH: join(directory, 'private.pem'),
        }),
      );
      const issued = await timed.issue('user-1', 'device-1');
      const claims = jwt.decode<{ exp: number; iat: number }>(issued.jwt);
      expect(claims.exp - claims.iat).toBe(3600);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps subscription expiry distinct from token expiry and verifies free claims', async () => {
    const expiresAtMs = Date.now() + 365 * 86400_000;
    const paid = new EntitlementService(
      jwt,
      {
        currentEntitlement: async () => ({
          plan: 'premium',
          isActive: true,
          expiresAtMs,
          graceUntilMs: expiresAtMs + 14 * 86400_000,
        }),
      } as unknown as BillingService,
      new ConfigService({
        JWT_SIGNING_KEY_PATH: join(directory, 'private.pem'),
      }),
    );
    const token = await paid.issue('user-1', 'device-1');
    expect(token.expires_at).toBe(expiresAtMs);
    expect(token.token_expires_at).toBeLessThan(expiresAtMs);
    expect((await paid.verify(token.jwt)).expires_at).toBe(expiresAtMs);
    const free = new EntitlementService(
      jwt,
      {
        currentEntitlement: async () => ({
          plan: 'free',
          isActive: false,
          expiresAtMs: 0,
          graceUntilMs: 0,
        }),
      } as unknown as BillingService,
      new ConfigService({
        JWT_SIGNING_KEY_PATH: join(directory, 'private.pem'),
      }),
    );
    expect(
      await free.verify((await free.issue('user-1', 'device-1')).jwt),
    ).toMatchObject({ plan: 'free', expires_at: 0, allowed_decks: [] });
  });
});
