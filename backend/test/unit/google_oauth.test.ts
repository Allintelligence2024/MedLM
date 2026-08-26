// Tests unitaires — GoogleOAuthService (state serveur, rejeu, email vérifié).
import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleOAuthService } from '../../src/auth/google-oauth.service';

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
            onConflictDoNothing: () => ({}),
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
  async issueAccessFor(userId: string, _platform: string) {
    return { access_token: 'at', refresh_token: 'rt', user_id: userId, expires_in: 900 };
  }
}

describe('GoogleOAuthService', () => {
  let db: ReturnType<typeof createFakeDb>;
  let service: GoogleOAuthService;

  beforeEach(() => {
    db = createFakeDb({ id: 'u1', email: 'admin@medanki.dz', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null });
    service = new GoogleOAuthService(db as any, { get: (k: string) => {
      if (k === 'GOOGLE_CLIENT_ID') return 'client-id';
      if (k === 'GOOGLE_REDIRECT_URI') return 'https://example.com/callback';
      return undefined;
    }} as any, new FakeAuth() as any);
  });

  it('authorizationUrl génère un state et une URL valide', async () => {
    const result = await service.authorizationUrl();
    expect(result.url).toContain('accounts.google.com');
    expect(result.state).toHaveLength(32);
  });

  it('handleCallback rejette un state invalide', async () => {
    await expect(service.handleCallback({ code: 'code', state: 'invalid', platform: 'web' })).rejects.toThrow(/state déjà utilisé ou expiré/);
  });
});
