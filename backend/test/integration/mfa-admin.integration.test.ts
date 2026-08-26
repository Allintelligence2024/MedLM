/// Test d'intégration — MFA admin (TOTP + backup codes) via HTTP.
///
/// On override JwtGuard pour fournir un utilisateur factice, et on
/// utilise un Drizzle factice pour rester indépendant de PostgreSQL.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DRIZZLE, DRIZZLE_READ } from '../../src/db/database.module';
import { JwtGuard } from '../../src/auth/jwt.guard';

const FAKE_USER = { sub: 'u1', kind: 'access', role: 'admin', mfa_verified: false };

const fakeGuard = {
  canActivate: (context: any) => {
    const req = context.switchToHttp().getRequest();
    req.user = FAKE_USER;
    return true;
  },
};

describe('MFA admin (intégration HTTP)', () => {
  let app: INestApplication;
  let fakeDb: any;
  let resetUser: () => void;

  function createFakeDb() {
    const user = { id: 'u1', email: 'admin@medanki.dz', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null };
    resetUser = () => {
      user.mfaEnabled = false;
      user.mfaSecret = null;
      user.mfaBackupCodes = null;
    };
    return {
      select() {
        const rows = [user];
        const p = Promise.resolve(rows);
        return {
          from() {
            return {
              where() {
                return { then: (res: any) => p.then(res) };
              },
            };
          },
        };
      },
      update() {
        return {
          set(v: any) {
            Object.assign(user, v);
            return {
              where() {
                return { then: (res: any) => Promise.resolve(res({ rowCount: 1 })) };
              },
            };
          },
        };
      },
      insert() {
        return {
          values() {
            return {
              returning: async () => [user],
              then: (res: any) => Promise.resolve(res([user])),
            };
          },
        };
      },
      delete() {
        return {
          where() {
            return { then: (res: any) => Promise.resolve(res([])) };
          },
        };
      },
      transaction: async (fn: any) => fn(fakeDb),
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
    fakeDb = createFakeDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE)
      .useValue(fakeDb)
      .overrideProvider(DRIZZLE_READ)
      .useValue(fakeDb)
      .overrideGuard(JwtGuard)
      .useValue(fakeGuard)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    resetUser();
  });

  it('POST /v1/auth/mfa/setup — génère secret + backup codes', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    expect(res.status).toBe(201);
    expect(res.body.secret).toHaveLength(32);
    expect(res.body.backupCodes).toHaveLength(10);
    expect(res.body.otpauthUrl).toContain('otpauth://totp/MedLM:');
  });

  it('POST /v1/auth/mfa/enable — active MFA avec un TOTP valide', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const { computeTOTP } = await import('../../src/auth/mfa.service');
    const totp = computeTOTP(secret, Date.now());

    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(res.status).toBe(201);
    expect(res.body.enabled).toBe(true);
  });

  it('POST /v1/auth/mfa/verify — émet un JWT avec mfa_verified=true', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const { computeTOTP } = await import('../../src/auth/mfa.service');
    const totp = computeTOTP(secret, Date.now());

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .send({ code: totp });
    expect(res.status).toBe(201);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.mfa_verified).toBe(true);
  });

  it('POST /v1/auth/mfa/verify — rejette un code invalide', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const { computeTOTP } = await import('../../src/auth/mfa.service');
    const totp = computeTOTP(secret, Date.now());

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .send({ code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('invalide');
  });

  it('POST /v1/auth/mfa/regenerate-backup — régénère les backup codes', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const { computeTOTP } = await import('../../src/auth/mfa.service');
    const totp = computeTOTP(secret, Date.now());

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/regenerate-backup')
      .send({ code: totp });
    expect(res.status).toBe(201);
    expect(res.body.backupCodes).toHaveLength(10);
  });

  it('POST /v1/auth/mfa/disable — désactive MFA', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const { computeTOTP } = await import('../../src/auth/mfa.service');
    const totp = computeTOTP(secret, Date.now());

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/disable')
      .send({ code: totp });
    expect(res.status).toBe(201);
    expect(res.body.disabled).toBe(true);
  });
});
