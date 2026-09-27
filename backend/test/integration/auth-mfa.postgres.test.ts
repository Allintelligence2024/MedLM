// Phase 3 — MFA RFC 6238, appareils, refresh séquentiel (PGlite).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRIZZLE, type Database } from '../../src/db/database.module';
import * as schema from '../../src/db/schema';
import { adminMfa, users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { AuthService, MAX_ACTIVE_DEVICES } from '../../src/auth/auth.service';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthSessionController } from '../../src/auth/auth-session.controller';
import { MfaService } from '../../src/auth/mfa.service';
import { MfaController } from '../../src/auth/mfa.controller';
import { JwtGuard } from '../../src/auth/jwt.guard';
import { totp, base32Decode } from '../../src/auth/totp';
import { createDecipheriv } from 'node:crypto';

const MFA_KEK = 'ab'.repeat(32);

describe('Auth — MFA / devices / refresh (PGlite)', () => {
  let app: INestApplication;
  let pg: PGlite;
  let db: Database;
  let auth: AuthService;
  let jwt: JwtService;
  let adminId = '';
  let studentId = '';

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    const dir = join(__dirname, '../../src/db/migrations');
    const journal = JSON.parse(
      readFileSync(join(dir, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    for (const entry of journal.entries) {
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8').replace(
        /CREATE EXTENSION IF NOT EXISTS pgcrypto;?/g,
        '',
      );
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) await pg.exec(statement);
      }
    }
    db = drizzle(pg, { schema }) as unknown as Database;
    const config = new ConfigService({
      MFA_KEK,
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 2592000,
      NODE_ENV: 'test',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'phase3-test' })],
      controllers: [AuthController, AuthSessionController, MfaController],
      providers: [
        AuthService,
        MfaService,
        JwtGuard,
        { provide: APP_GUARD, useClass: JwtGuard },
        { provide: DRIZZLE, useValue: db },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    auth = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    const [admin] = await db
      .insert(users)
      .values({ email: 'admin-mfa@test.invalid', rbacRole: 'admin' })
      .returning({ id: users.id });
    const [student] = await db
      .insert(users)
      .values({ email: 'student-mfa@test.invalid', rbacRole: 'student' })
      .returning({ id: users.id });
    adminId = admin!.id;
    studentId = student!.id;
  });

  afterAll(async () => {
    await app.close();
    await pg.close();
  });

  it('un étudiant reçoit une session complète sans MFA', async () => {
    const session = await auth.issueAccessFor(studentId, 'web');
    expect(session).toHaveProperty('access_token');
  });

  it('un admin sans MFA doit s’enrôler — access_token refusé', async () => {
    const gate = await auth.issueAccessFor(adminId, 'web');
    expect(gate).toMatchObject({ status: 'mfa_enrollment_required' });
    if (!('enrollment_token' in gate)) throw new Error('expected enroll');
    const payload = await jwt.verifyAsync<{ kind: string }>(gate.enrollment_token);
    expect(payload.kind).toBe('mfa_enroll');
  });

  it('enrôlement RFC 6238 + enable + verify, sans bypass', async () => {
    const gate = await auth.issueAccessFor(adminId, 'web');
    if (!('enrollment_token' in gate)) throw new Error('expected enroll');
    const setup = await request(app.getHttpServer())
      .post('/v1/auth/mfa/setup')
      .send({ enrollment_token: gate.enrollment_token })
      .expect(200);
    expect(setup.body.otpauth_url).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.body.secret_base32).toMatch(/^[A-Z2-7]+$/);
    const secret = base32Decode(setup.body.secret_base32 as string);
    const bad = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ enrollment_token: gate.enrollment_token, code: '000000' })
      .expect(401);
    expect(bad.body).not.toHaveProperty('access_token');
    const code = totp(secret, Date.now());
    const enabled = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .set('X-Platform', 'web')
      .set('X-Device-Id', 'cms-admin-1')
      .send({ enrollment_token: gate.enrollment_token, code })
      .expect(200);
    expect(enabled.body.access_token).toBeTruthy();
    expect(enabled.body.backup_codes).toHaveLength(8);
    const replayEnroll = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enable')
      .send({ enrollment_token: gate.enrollment_token, code })
      .expect(403);
    expect(replayEnroll.body).not.toHaveProperty('access_token');

    const me = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${enabled.body.access_token}`)
      .expect(200);
    expect(me.body.role).toBe('admin');
    const pending = await auth.issueAccessFor(adminId, 'web');
    expect(pending).toMatchObject({ status: 'mfa_required' });
    if (!('mfa_token' in pending)) throw new Error('expected pending');
    const accessAttempt = await jwt.verifyAsync<{ kind: string }>(pending.mfa_token);
    expect(accessAttempt.kind).toBe('mfa_pending');
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .send({ mfa_token: pending.mfa_token, code: '000000' })
      .expect(401);
    await db.update(adminMfa).set({ lastCounter: 0n }).where(eq(adminMfa.userId, adminId));
    const totpLogin = totp(secret, Date.now());
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('X-Platform', 'web')
      .set('X-Device-Id', 'cms-admin-1')
      .send({ mfa_token: pending.mfa_token, code: totpLogin })
      .expect(200);
    const backup = enabled.body.backup_codes[0] as string;
    const pending2 = await auth.issueAccessFor(adminId, 'web');
    if (!('mfa_token' in pending2)) throw new Error('expected pending');
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('X-Platform', 'web')
      .send({ mfa_token: pending2.mfa_token, backup_code: backup })
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('X-Platform', 'web')
      .send({ mfa_token: pending2.mfa_token, backup_code: backup })
      .expect(401);
  });

  it('réutilise le même X-Device-Id et refuse le 4ᵉ appareil', async () => {
    const [fresh] = await db
      .insert(users)
      .values({ email: 'devices-cap@test.invalid' })
      .returning({ id: users.id });
    const userId = fresh!.id;
    const a = await auth.issueFullSession({
      userId,
      platform: 'ios',
      deviceToken: 'phone-a',
    });
    const a2 = await auth.issueFullSession({
      userId,
      platform: 'ios',
      deviceToken: 'phone-a',
    });
    expect(a.user_id).toBe(a2.user_id);
    await auth.issueFullSession({ userId, platform: 'android', deviceToken: 'phone-b' });
    await auth.issueFullSession({ userId, platform: 'web', deviceToken: 'laptop' });
    await expect(
      auth.issueFullSession({ userId, platform: 'web', deviceToken: 'tablet' }),
    ).rejects.toThrow(/appareils/);
    expect(MAX_ACTIVE_DEVICES).toBe(3);
  });

  it('un refresh séquentiel du même jeton : 1er OK, 2ᵉ 401', async () => {
    const session = await auth.issueFullSession({
      userId: studentId,
      platform: 'web',
      deviceToken: 'phone-a',
    });
    const first = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: session.refresh_token })
      .expect(200);
    expect(first.body.access_token).toBeTruthy();
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: session.refresh_token })
      .expect(401);
  });

  it('logout révoque le refresh', async () => {
    const session = await auth.issueFullSession({
      userId: studentId,
      platform: 'web',
      deviceToken: 'phone-a',
    });
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refresh_token: session.refresh_token })
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: session.refresh_token })
      .expect(401);
  });

  it('replace MFA : JWT requis, TOTP actuel, ancien secret jusqu’à confirm', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/replace/begin')
      .send({ current_code: '123456' })
      .expect(401);
    const student = await auth.issueFullSession({
      userId: studentId,
      platform: 'web',
      deviceToken: 'phone-a',
    });
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/replace/begin')
      .set('Authorization', `Bearer ${student.access_token}`)
      .send({ current_code: '123456' })
      .expect(403);

    const row = await db
      .select()
      .from(adminMfa)
      .where(eq(adminMfa.userId, adminId))
      .then((rows) => rows[0]);
    expect(row?.enabled).toBe(true);
    const kek = Buffer.from(MFA_KEK, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', kek, row!.secretIv);
    decipher.setAuthTag(row!.secretTag);
    const oldSecret = Buffer.concat([decipher.update(row!.secretCiphertext), decipher.final()]);
    await db.update(adminMfa).set({ lastCounter: 0n }).where(eq(adminMfa.userId, adminId));
    const admin = await auth.issueFullSession({
      userId: adminId,
      platform: 'web',
      deviceToken: 'cms-admin-1',
    });
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/replace/begin')
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ current_code: '000000' })
      .expect(401);
    const begin = await request(app.getHttpServer())
      .post('/v1/auth/mfa/replace/begin')
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ current_code: totp(oldSecret, Date.now()) })
      .expect(200);
    expect(begin.body.secret_base32).toMatch(/^[A-Z2-7]+$/);
    expect(begin.body.otpauth_url).toMatch(/^otpauth:\/\/totp\//);

    await db.update(adminMfa).set({ lastCounter: 0n }).where(eq(adminMfa.userId, adminId));
    const pending = await auth.issueAccessFor(adminId, 'web');
    expect(pending).toMatchObject({ status: 'mfa_required' });
    if (!('mfa_token' in pending)) throw new Error('expected pending');
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('X-Platform', 'web')
      .set('X-Device-Id', 'cms-admin-1')
      .send({ mfa_token: pending.mfa_token, code: totp(oldSecret, Date.now()) })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/mfa/replace/confirm')
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ new_code: '000000' })
      .expect(401);
    const nextSecret = base32Decode(begin.body.secret_base32 as string);
    const confirmed = await request(app.getHttpServer())
      .post('/v1/auth/mfa/replace/confirm')
      .set('Authorization', `Bearer ${admin.access_token}`)
      .send({ new_code: totp(nextSecret, Date.now()) })
      .expect(200);
    expect(confirmed.body.backup_codes).toHaveLength(8);

    await db.update(adminMfa).set({ lastCounter: 0n }).where(eq(adminMfa.userId, adminId));
    const after = await auth.issueAccessFor(adminId, 'web');
    if (!('mfa_token' in after)) throw new Error('expected pending');
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('X-Platform', 'web')
      .set('X-Device-Id', 'cms-admin-1')
      .send({ mfa_token: after.mfa_token, code: totp(oldSecret, Date.now()) })
      .expect(401);
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('X-Platform', 'web')
      .set('X-Device-Id', 'cms-admin-1')
      .send({ mfa_token: after.mfa_token, code: totp(nextSecret, Date.now()) })
      .expect(200);
  });
});
