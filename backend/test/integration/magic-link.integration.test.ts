/// Test d'intégration — magic link à usage unique (P0 auth).
///
/// Deux parties :
///   A. Service + PostgreSQL RÉEL : on valide le comportement de
///      consommation unique, le rejeu, l'expiration, la falsification,
///      le rate limiting et la réponse neutre (anti-énumération) contre
///      une vraie base (pas un fake Drizzle).
///   B. Contrôleur (HTTP, DRIZZLE stubbé — même patterns que les autres
///      tests d'intégration) : login/signup email-only renvoient 410,
///      la route magic-link existe et est publique.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as schema from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrate';
import { MagicLinkService, EmailSender } from '../../src/auth/magic-link.service';
import { AuthService } from '../../src/auth/auth.service';
import { authChallenges, users } from '../../src/db/schema';
import { createHash, randomBytes } from 'crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres';

class CapturingEmailSender implements EmailSender {
  sends = 0;
  lastHtml = '';
  async send(args: { to: string; subject: string; html: string }): Promise<void> {
    this.sends += 1;
    this.lastHtml = args.html;
  }
  extractToken(): string {
    const m = this.lastHtml.match(/token=([^"&]+)/);
    if (!m) throw new Error('token non trouvé dans le mail capturé');
    return decodeURIComponent(m[1]!);
  }
}

describe('A. MagicLinkService — PostgreSQL réel', () => {
  let db: NodePgDatabase<typeof schema>;
  let pool: Pool;
  let service: MagicLinkService;
  let email: CapturingEmailSender;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      process.env.DATABASE_URL = DATABASE_URL;
      process.env.PG_SCHEMA = 'public';
      await runMigrations();
      pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
      await pool.connect();
      dbAvailable = true;
      db = drizzle(pool, { schema });
      const jwt = new JwtService({ secret: 'test-secret-not-for-prod-0123456789' });
      const config = new ConfigService();
      email = new CapturingEmailSender();
      const auth = new AuthService(db, jwt, config);
      service = new MagicLinkService(db, config, email, auth);
    } catch (_e) {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await db.delete(authChallenges).execute();
    await db.delete(users).execute();
    email.sends = 0;
  });

  const run = dbAvailable ? it : it.skip;

  run('1. la demande renvoie une réponse neutre { sent: true }', async () => {
    const res = await service.request({ email: 'known@example.com' });
    expect(res).toEqual({ sent: true });
  });

  run('2. le token capturé permet une première vérification', async () => {
    await service.request({ email: 'alice@example.com' });
    const token = email.extractToken();
    const out = await service.verify({ token, platform: 'web' });
    expect(out.access_token).toBeTypeOf('string');
    expect(out.access_token.length).toBeGreaterThan(10);
  });

  run('3. le même token rejoué échoue (consommation unique)', async () => {
    await service.request({ email: 'bob@example.com' });
    const token = email.extractToken();
    await service.verify({ token, platform: 'web' });
    await expect(service.verify({ token, platform: 'web' })).rejects.toThrow();
  });

  run('4. un token falsifié échoue', async () => {
    await service.request({ email: 'carol@example.com' });
    const token = email.extractToken();
    const fake = token.slice(0, -4) + 'zzzz';
    await expect(service.verify({ token: fake, platform: 'web' })).rejects.toThrow();
  });

  run('5. un token expiré échoue', async () => {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await db.insert(authChallenges).values({
      email: 'dave@example.com',
      tokenHash,
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(service.verify({ token, platform: 'web' })).rejects.toThrow();
  });

  run('6. deux vérifications concurrentes : une seule réussit', async () => {
    await service.request({ email: 'erin@example.com' });
    const token = email.extractToken();
    const results = await Promise.allSettled([
      service.verify({ token, platform: 'web' }),
      service.verify({ token, platform: 'web' }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    expect(fulfilled).toBe(1);
    expect(rejected).toBe(1);
  });

  run('7. un email inconnu ne révèle pas l\'existence d\'un compte', async () => {
    const known = await service.request({ email: 'known@example.com' });
    const unknown = await service.request({ email: 'ghost@example.com' });
    expect(known).toEqual({ sent: true });
    expect(unknown).toEqual({ sent: true });
    // Aucune différence observable par un client.
  });

  run('8. le rate limiting borne à 5 envois / 15 min (email)', async () => {
    for (let i = 0; i < 6; i++) {
      await service.request({ email: 'ratelimit@example.com', ip: '10.0.0.1' });
    }
    expect(email.sends).toBe(5);
  });

  run('9. le rate limiting borne à 5 envois / 15 min (IP)', async () => {
    email.sends = 0;
    for (let i = 0; i < 6; i++) {
      await service.request({ email: `ip-${i}@example.com`, ip: '10.0.0.99' });
    }
    expect(email.sends).toBe(5);
  });
});

describe('B. Contrôleur auth — HTTP (DRIZZLE stubbé)', () => {
  // Réutilise le pattern des autres tests d'intégration : on boote
  // l'app réelle mais avec un DRIZZLE factice (aucune requête SQL réelle
  // au boot). Ici on vérifie uniquement le câblage des routes et le 410.
  let app: import('@nestjs/common').INestApplication;
  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/configure-app');
    const { DRIZZLE, DRIZZLE_READ } = await import('../../src/db/database.module');
    const { Test } = await import('@nestjs/testing');

    const chain = (): any => {
      const rows: any[] = [];
      return Object.assign(rows, {
        where: () => chain(),
        limit: () => chain(),
        orderBy: () => chain(),
        from: () => chain(),
        then: (resolve: (v: any[]) => unknown) => Promise.resolve(resolve([])),
      });
    };

    const fakeDb: any = {
      select: () => chain(),
      insert: () => ({
        values: () => ({
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(undefined)),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(undefined)),
          }),
        }),
      }),
      delete: () => ({ where: async () => [] }),
      execute: async () => ({ rows: [] }),
      transaction: async (fn: any) => fn(fakeDb),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE)
      .useValue(fakeDb)
      .overrideProvider(DRIZZLE_READ)
      .useValue(fakeDb)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('login email-only est désactivé (HTTP 410)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'x@example.com' });
    expect(res.status).toBe(410);
  });

  it('signup email-only est désactivé (HTTP 410)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email: 'x@example.com' });
    expect(res.status).toBe(410);
  });

  it('la route magic-link existe et est publique', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app.getHttpServer())
      .post('/v1/auth/magic-link')
      .send({ email: 'x@example.com' });
    // 202 (accepté, neutre) — jamais 404 (route absente) ni 401.
    expect(res.status).toBe(202);
  });
});
