// Tests unitaires — MfaService (TOTP + backup codes).
import { describe, it, expect, beforeEach } from 'vitest';
import { MfaService, computeTOTP } from '../../src/auth/mfa.service';

function createFakeDb(initialData: any) {
  const data = { ...initialData };
  return {
    data,
    transaction: async (fn: any) => fn(createFakeDb(data)),
    select() {
      const rows = [data];
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
    insert() {
      const done = Promise.resolve().then(() => {});
      return {
        values() {
          return {
            returning: async () => [{ id: 'device-1' }],
            then: (res: any) => done.then(res),
          };
        },
      };
    },
    update() {
      return {
        set(v: any) {
          Object.assign(data, v);
          return {
            where() {
              return this;
            },
          };
        },
      };
    },
  };
}

class FakeAuth {
  async issueMfaTokens(userId: string, _platform: string) {
    return { access_token: 'at', refresh_token: 'rt', user_id: userId, expires_in: 900 };
  }
}

describe('MfaService', () => {
  let db: ReturnType<typeof createFakeDb>;
  let service: MfaService;

  beforeEach(() => {
    db = createFakeDb({ id: 'u1', email: 'admin@medanki.dz', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null });
    service = new MfaService(db as any, new FakeAuth() as any);
  });

  it('setup génère un secret et 10 backup codes', async () => {
    const result = await service.setup('u1');
    expect(result.secret).toHaveLength(32);
    expect(result.backupCodes).toHaveLength(10);
    expect(result.otpauthUrl).toContain('otpauth://totp/MedLM:admin@medanki.dz');
  });

  it('enable avec un code TOTP valide active MFA', async () => {
    const { secret } = await service.setup('u1');
    db.data.mfaSecret = secret;
    const expectedCode = computeTOTP(secret, Date.now());
    await service.enable('u1', expectedCode);
    expect(db.data.mfaEnabled).toBe(true);
  });

  it('enable avec un code invalide échoue', async () => {
    const { secret } = await service.setup('u1');
    db.data.mfaSecret = secret;
    await expect(service.enable('u1', '000000')).rejects.toThrow(/invalide/);
    expect(db.data.mfaEnabled).toBe(false);
  });

  it('verify accepte TOTP et backup codes', async () => {
    const { secret, backupCodes } = await service.setup('u1');
    db.data.mfaSecret = secret;
    db.data.mfaEnabled = true;
    const valid = await service.verify('u1', backupCodes[0]!);
    expect(valid).toBe(true);
  });

  it('verify rejette un code inconnu', async () => {
    const { secret } = await service.setup('u1');
    db.data.mfaSecret = secret;
    db.data.mfaEnabled = true;
    const valid = await service.verify('u1', '000000');
    expect(valid).toBe(false);
  });

  it('disable désactive MFA', async () => {
    const { secret } = await service.setup('u1');
    db.data.mfaSecret = secret;
    db.data.mfaEnabled = true;
    const expectedCode = computeTOTP(secret, Date.now());
    await service.disable('u1', expectedCode);
    expect(db.data.mfaEnabled).toBe(false);
    expect(db.data.mfaSecret).toBeNull();
  });

  it('regenerateBackupCodes remplace les backup codes', async () => {
    const { secret } = await service.setup('u1');
    db.data.mfaSecret = secret;
    db.data.mfaEnabled = true;
    const expectedCode = computeTOTP(secret, Date.now());
    const codes = await service.regenerateBackupCodes('u1', expectedCode);
    expect(codes).toHaveLength(10);
  });
});
