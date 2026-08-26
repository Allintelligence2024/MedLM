/// Test d'intégration — MFA admin (TOTP + backup codes) via HTTP.
///
/// On utilise un guard JWT factice et un Drizzle factice qui simule
/// un singleton par utilisateur, pour rester indépendant de PostgreSQL.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DRIZZLE, DRIZZLE_READ } from '../../src/db/database.module';
import { JwtGuard } from '../../src/auth/jwt.guard';
import { UnauthorizedException } from '@nestjs/common';

const FAKE_USER = { sub: 'u1', kind: 'access' as const, role: 'admin' as const, mfa_verified: false };

const fakeGuard = {
  canActivate: (context: any) => {
    const req = context.switchToHttp().getRequest();
    const url = req.url?.split('?')[0] ?? '';
    const isMfaSetupRoute = url.startsWith('/v1/auth/mfa/setup') || url.startsWith('/v1/auth/mfa/enable') || url.startsWith('/v1/auth/mfa/verify');
    
    const user = { ...FAKE_USER };
    
    if (!isMfaSetupRoute && user.role === 'admin' && !user.mfa_verified) {
      throw new UnauthorizedException('MFA requis pour les administrateurs');
    }
    
    req.user = user;
    return true;
  },
};

describe('MFA admin (intégration HTTP)', () => {
  let app: INestApplication;
  let fakeDb: any;

  function createFakeDb() {
    const store = new Map<string, any>();
    const defaultUser = {
      id: 'u1',
      email: 'admin@medanki.dz',
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    };
    store.set('u1', { ...defaultUser });

    const getUser = (id: string) => store.get(id) ?? { ...defaultUser, id };

    return {
      select() {
        const id = 'u1';
        const rows = [getUser(id)];
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
            const current = getUser('u1');
            Object.assign(current, v);
            store.set('u1', current);
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
            const user = getUser('u1');
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
      _reset() {
        store.set('u1', { ...defaultUser });
      },
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
    fakeDb._reset();
    FAKE_USER.mfa_verified = false;
  });

  const getTotp = async (secretBase32: string) => {
    const { computeTOTP } = await import('../../src/auth/mfa.service');
    return computeTOTP(secretBase32, Date.now());
  };

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
    const totp = await getTotp(secret);

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
    const totp = await getTotp(secret);

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
    const totp = await getTotp(secret);

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

  it('POST /v1/auth/mfa/regenerate-backup — régénère les backup codes (MFA vérifié requis)', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const totp = await getTotp(secret);

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const verifyRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .send({ code: totp });
    expect(verifyRes.status).toBe(201);
    FAKE_USER.mfa_verified = true;

    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/regenerate-backup')
      .send({ code: totp });
    expect(res.status).toBe(201);
    expect(res.body.backupCodes).toHaveLength(10);
  });

  it('POST /v1/auth/mfa/disable — désactive MFA (MFA vérifié requis)', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const totp = await getTotp(secret);

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const verifyRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .send({ code: totp });
    expect(verifyRes.status).toBe(201);
    FAKE_USER.mfa_verified = true;

    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/disable')
      .send({ code: totp });
    expect(res.status).toBe(201);
    expect(res.body.disabled).toBe(true);
  });

  it('admin non vérifié ne peut pas désactiver MFA', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/disable')
      .send({ code: '000000' });
    expect(res.status).toBe(401);
  });

  it('admin non vérifié ne peut pas régénérer les backup codes', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/mfa/regenerate-backup')
      .send({ code: '000000' });
    expect(res.status).toBe(401);
  });

  it('backup code usage unique — second usage échoue', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const totp = await getTotp(secret);

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const backupCode = setupRes.body.backupCodes[0]!;
    const first = await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .send({ code: backupCode });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .send({ code: backupCode });
    expect(second.status).toBe(400);
  });

  it('backup code usage concurrent — une seule réussite', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup');
    const secret = setupRes.body.secret;
    const totp = await getTotp(secret);

    const enableRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ code: totp });
    expect(enableRes.status).toBe(201);

    const backupCode = setupRes.body.backupCodes[0]!;
    const results = await Promise.allSettled([
      request(app.getHttpServer()).post('/v1/auth/mfa/verify').send({ code: backupCode }),
      request(app.getHttpServer()).post('/v1/auth/mfa/verify').send({ code: backupCode }),
    ]);
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 'rejected'));
    const successes = statuses.filter((s) => s === 201).length;
    const failures = statuses.filter((s) => s === 400 || s === 'rejected').length;
    expect(successes).toBe(1);
    expect(failures).toBe(1);
  });
});
