/// Test d'intégration — MFA admin contre PostgreSQL RÉEL.
///
/// Ce fichier complète `mfa-admin.integration.test.ts` (fake DB) par
/// une validation contre la vraie base de données, le vrai `JwtGuard`,
/// le vrai `RbacGuard` et le vrai controller Nest.
///
/// Si PostgreSQL n'est pas disponible, l'ensemble de la describe est
/// ignoré avec un message explicite.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DRIZZLE, DRIZZLE_READ } from '../../src/db/database.module';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrate';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres';

describe('MFA admin — PostgreSQL réel', () => {
  let db: NodePgDatabase<typeof schema>;
  let pool: Pool;
  let app: INestApplication;
  let jwt: JwtService;
  let dbAvailable = false;
  let adminUserId: string | null = null;

  beforeAll(async () => {
    try {
      process.env.DATABASE_URL = DATABASE_URL;
      process.env.PG_SCHEMA = 'public';
      process.env.NODE_ENV = 'test';
      process.env.LOG_LEVEL = 'error';
      process.env.AI_LLM_PROVIDER = 'mock';
      process.env.AI_TRANSCRIBER_PROVIDER = 'mock';
      process.env.JWT_SIGNING_KEY_PATH = '';
      process.env.JWT_PUBLIC_KEY_PATH = '';

      await runMigrations();
      pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
      await pool.connect();
      db = drizzle(pool, { schema });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DRIZZLE)
        .useValue(db)
        .overrideProvider(DRIZZLE_READ)
        .useValue(db)
        .compile();

      app = moduleRef.createNestApplication();
      configureApp(app);
      await app.init();

      jwt = moduleRef.get(JwtService);
      dbAvailable = true;
    } catch (_e) {
      dbAvailable = false;
      if (process.env.CI) {
        throw new Error('Base de données PostgreSQL indisponible en CI — tests MFA PostgreSQL bloqués.');
      }
    }
  });

  afterAll(async () => {
    if (adminUserId && dbAvailable) {
      try {
        await db.delete(users).where(eq(users.id, adminUserId));
      } catch { /* ignore cleanup errors */ }
    }
    await app?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
  });

  const createAdminUser = async (): Promise<string> => {
    const email = `mfa-admin-${Date.now()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({
        email,
        rbacRole: 'admin',
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
      })
      .returning();
    if (!user) throw new Error('utilisateur admin non créé');
    return user.id;
  };

  const getToken = async (userId: string, mfaVerified = false): Promise<string> => {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    const user = rows[0];
    if (!user) throw new Error('utilisateur introuvable');
    const token = await jwt.signAsync(
      { sub: userId, kind: 'access', role: 'admin', mfa_verified: mfaVerified },
      { expiresIn: 900, secret: 'test-secret-not-for-prod-0123456789' },
    );
    return token;
  };

  const authHeader = (token: string) => `Bearer ${token}`;

  describe('quand PostgreSQL est disponible', () => {
    beforeAll(() => {
      if (!dbAvailable) {
        console.log('  PostgreSQL indisponible — tests MFA PostgreSQL ignorés.');
      }
    });

    it('crée un admin et obtient un JWT', async () => {
      if (!dbAvailable) return;
      adminUserId = await createAdminUser();
      expect(adminUserId).toBeDefined();
      expect(adminUserId!.length).toBeGreaterThan(0);
    });

    it('admin non vérifié est bloqué par JwtGuard (401)', async () => {
      if (!dbAvailable || !adminUserId) return;
      const token = await getToken(adminUserId, false);
      const res = await request(app.getHttpServer())
        .get('/v1/tenants')
        .set('Authorization', authHeader(token));
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('MFA requis');
    });

    it('flow MFA complet : setup → enable → verify → accès admin', async () => {
      if (!dbAvailable || !adminUserId) return;

      const token = await getToken(adminUserId, false);

      const setupRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/setup')
        .set('Authorization', authHeader(token));
      expect(setupRes.status).toBe(201);
      expect(setupRes.body.secret).toHaveLength(32);
      expect(setupRes.body.backupCodes).toHaveLength(10);

      const secret = setupRes.body.secret;
      const { computeTOTP } = await import('../../src/auth/mfa.service');
      const totp = computeTOTP(secret, Date.now());

      const enableRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enable')
        .set('Authorization', authHeader(token))
        .send({ code: totp });
      expect(enableRes.status).toBe(201);
      expect(enableRes.body.enabled).toBe(true);

      const verifyRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', authHeader(token))
        .send({ code: totp });
      expect(verifyRes.status).toBe(201);
      expect(verifyRes.body.mfa_verified).toBe(true);
      expect(verifyRes.body.access_token).toBeDefined();

      const verifiedToken = verifyRes.body.access_token;
      const adminRes = await request(app.getHttpServer())
        .get('/v1/tenants')
        .set('Authorization', `Bearer ${verifiedToken}`);
      expect(adminRes.status).toBe(200);
    });

    it('token forgé avec mfa_verified=true est rejeté (401)', async () => {
      if (!dbAvailable || !adminUserId) return;
      const forgedToken = await getToken(adminUserId, true);
      const res = await request(app.getHttpServer())
        .get('/v1/tenants')
        .set('Authorization', authHeader(forgedToken));
      expect(res.status).toBe(401);
    });

    it('disable MFA sans code valide est rejeté (400)', async () => {
      if (!dbAvailable || !adminUserId) return;
      const token = await getToken(adminUserId, false);

      const setupRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/setup')
        .set('Authorization', authHeader(token));
      const secret = setupRes.body.secret;
      const { computeTOTP } = await import('../../src/auth/mfa.service');
      const totp = computeTOTP(secret, Date.now());

      const enableRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enable')
        .set('Authorization', authHeader(token))
        .send({ code: totp });
      expect(enableRes.status).toBe(201);

      const disableRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/disable')
        .set('Authorization', authHeader(token))
        .send({ code: '000000' });
      expect(disableRes.status).toBe(400);
    });

    it('backup code utilisé deux fois : une seule réussit (concurrence réelle)', async () => {
      if (!dbAvailable || !adminUserId) return;
      const token = await getToken(adminUserId, false);

      const setupRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/setup')
        .set('Authorization', authHeader(token));
      const secret = setupRes.body.secret;
      const { computeTOTP } = await import('../../src/auth/mfa.service');
      const totp = computeTOTP(secret, Date.now());

      const enableRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enable')
        .set('Authorization', authHeader(token))
        .send({ code: totp });
      expect(enableRes.status).toBe(201);

      const backupCode = setupRes.body.backupCodes[0]!;
      const results = await Promise.allSettled([
        request(app.getHttpServer())
          .post('/v1/auth/mfa/verify')
          .set('Authorization', authHeader(token))
          .send({ code: backupCode }),
        request(app.getHttpServer())
          .post('/v1/auth/mfa/verify')
          .set('Authorization', authHeader(token))
          .send({ code: backupCode }),
      ]);
      const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 'rejected'));
      const successes = statuses.filter((s) => s === 201).length;
      const failures = statuses.filter((s) => s === 400 || s === 'rejected').length;
      expect(successes).toBe(1);
      expect(failures).toBe(1);
    });

    it('le secret TOTP n\'est jamais exposé dans les réponses HTTP', async () => {
      if (!dbAvailable || !adminUserId) return;
      const token = await getToken(adminUserId, false);

      const setupRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/setup')
        .set('Authorization', authHeader(token));
      expect(setupRes.status).toBe(201);
      expect(setupRes.body.secret).toBeUndefined();
    });
  });
});
