// CI-only fixture generator. Uses the real issuer and JWT library, never production keys.
import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EntitlementService } from './entitlement.service';
import type { BillingService } from '../billing/billing.service';

async function main() {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('fixture generation requires NODE_ENV=test');
  const output = process.argv[2];
  if (!output) throw new Error('output path required');
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const directory = mkdtempSync(join(tmpdir(), 'entitlement-interop-'));
  try {
    const publicPath = join(directory, 'public.pem');
    writeFileSync(publicPath, keys.publicKey);
    // Prevent environment settings from substituting a deployment verification key.
    process.env.JWT_PUBLIC_KEY_PATH = publicPath;
    process.env.JWT_SIGNING_KEY_PATH = '';
    process.env.JWT_ENTITLEMENT_TTL_SECONDS = '86400';
    const jwt = new JwtService({
      privateKey: keys.privateKey,
      signOptions: { algorithm: 'RS256' },
    });
    const config = new ConfigService();
    const expiry = Date.now() + 365 * 86400_000;
    const issuer = (premium: boolean) =>
      new EntitlementService(
        jwt,
        {
          currentEntitlement: async () => ({
            plan: premium ? 'premium' : 'free',
            isActive: premium,
            expiresAtMs: premium ? expiry : 0,
            graceUntilMs: premium ? expiry + 14 * 86400_000 : 0,
          }),
        } as unknown as BillingService,
        config,
      );
    const premium = await issuer(true).issue('interop-user', 'interop-device');
    const free = await issuer(false).issue('interop-user', 'interop-device');
    await issuer(true).verify(premium.jwt);
    const expired = await jwt.signAsync(
      {
        kind: 'entitlement',
        user_id: 'interop-user',
        device_id: 'interop-device',
        plan: 'premium',
        expires_at: expiry,
        grace_until: expiry,
        allowed_decks: ['*'],
      },
      { expiresIn: -10 },
    );
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(
      output,
      JSON.stringify({
        publicKey: keys.publicKey,
        premium,
        free,
        expired,
        subscriptionExpiresAt: expiry,
      }),
    );
    process.stdout.write(
      'Ephemeral backend entitlement fixtures generated; private key not exported.\n',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(() => {
  process.stderr.write('Entitlement fixture generation failed.\n');
  process.exitCode = 1;
});
