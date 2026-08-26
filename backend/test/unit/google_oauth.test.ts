// Tests unitaires — GoogleOAuthService (state serveur, rejeu, email vérifié).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthService } from '../../src/auth/google-oauth.service';
import { oauthStates, users } from '../../src/db/schema';
import { createHash } from 'crypto';

function createFakeDb() {
  const oauthStatesMap = new Map<string, { stateHash: string; usedAt: Date | null; expiresAt: Date }>();
  const usersMap = new Map<string, any>([
    ['u1', { id: 'u1', email: 'admin@medanki.dz', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null }],
  ]);

  const fakeDb: any = {
    oauthStatesMap,
    usersMap,
    transaction: async (fn: any) => fn(createFakeDb()),
    select() {
      return {
        from(table: any) {
          if (table === oauthStates) {
            const rows = Array.from(oauthStatesMap.values());
            const p = Promise.resolve(rows);
            return {
              where(_condition: any) {
                return { then: (res: any) => p.then(res) };
              },
            };
          }
          if (table === users) {
            const rows = Array.from(usersMap.values());
            const p = Promise.resolve(rows);
            return {
              where(_condition: any) {
                return { then: (res: any) => p.then(res) };
              },
            };
          }
          return { where: () => ({ then: (res: any) => Promise.resolve(res([])) }) };
        },
      };
    },
    insert() {
      return {
        values(v: any) {
          if (v.stateHash) {
            oauthStatesMap.set(v.stateHash, { stateHash: v.stateHash, usedAt: null, expiresAt: v.expiresAt });
          }
          const chain: any = {
            returning: async () => [{ id: 'device-1' }],
            then: (res: any) => Promise.resolve(res([])),
            onConflictDoNothing: () => chain,
          };
          return chain;
        },
      };
    },
    update() {
      return {
        set(_v: any) {
          return {
            where(_condition: any) {
              let updated = 0;
              for (const entry of oauthStatesMap.values()) {
                if (entry.usedAt === null) {
                  entry.usedAt = new Date();
                  updated++;
                }
              }
              const rowCount = updated;
              return { then: (res: any) => Promise.resolve(res({ rowCount })) };
            },
          };
        },
      };
    },
  };

  return fakeDb;
}

class FakeAuth {
  async issueAccessFor(userId: string, _platform: string) {
    return { access_token: 'at', refresh_token: 'rt', user_id: userId, expires_in: 900 };
  }
}

describe('GoogleOAuthService', () => {
  let db: any;
  let service: GoogleOAuthService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    db = createFakeDb();
    service = new GoogleOAuthService(db as any, { get: (k: string) => {
      if (k === 'GOOGLE_CLIENT_ID') return 'client-id';
      if (k === 'GOOGLE_REDIRECT_URI') return 'https://example.com/callback';
      if (k === 'GOOGLE_CLIENT_SECRET') return 'client-secret';
      return undefined;
    }} as any, new FakeAuth() as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('authorizationUrl génère un state et une URL valide', async () => {
    const result = await service.authorizationUrl();
    expect(result.url).toContain('accounts.google.com');
    expect(result.state).toHaveLength(32);
  });

  it('handleCallback rejette un state invalide', async () => {
    await expect(service.handleCallback({ code: 'code', state: 'invalid', platform: 'web' })).rejects.toThrow(/state invalide/);
  });

  it('handleCallback rejette un state déjà utilisé (rejeu)', async () => {
    const state = 'validstate123456789012345678901234';
    const stateHash = createHash('sha256').update(state).digest('hex');

    await db.insert(oauthStates).values({ stateHash, expiresAt: new Date(Date.now() + 60000) }).onConflictDoNothing({ target: [oauthStates.stateHash] });
    db.oauthStatesMap.get(stateHash)!.usedAt = new Date();

    await expect(service.handleCallback({ code: 'code', state, platform: 'web' })).rejects.toThrow(/state déjà utilisé ou expiré/);
  });

  it('handleCallback rejette un code Google invalide', async () => {
    const state = 'validstate123456789012345678901234';
    const stateHash = createHash('sha256').update(state).digest('hex');

    await db.insert(oauthStates).values({ stateHash, expiresAt: new Date(Date.now() + 60000) }).onConflictDoNothing({ target: [oauthStates.stateHash] });

    global.fetch = async () => new Response('invalid_code', { status: 400 });

    await expect(service.handleCallback({ code: 'invalid_google_code', state, platform: 'web' })).rejects.toThrow(/Google token endpoint/);
  });

  it('handleCallback rejette un email non vérifié', async () => {
    const state = 'validstate123456789012345678901234';
    const stateHash = createHash('sha256').update(state).digest('hex');

    await db.insert(oauthStates).values({ stateHash, expiresAt: new Date(Date.now() + 60000) }).onConflictDoNothing({ target: [oauthStates.stateHash] });

    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ access_token: 'at', id_token: 'id_token' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ email: 'user@example.com', email_verified: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    await expect(service.handleCallback({ code: 'code', state, platform: 'web' })).rejects.toThrow(/email Google non vérifié/);
  });

  it('handleCallback accepte un flux OAuth complet valide', async () => {
    const state = 'validstate123456789012345678901234';
    const stateHash = createHash('sha256').update(state).digest('hex');

    await db.insert(oauthStates).values({ stateHash, expiresAt: new Date(Date.now() + 60000) }).onConflictDoNothing({ target: [oauthStates.stateHash] });

    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ access_token: 'google_at', id_token: 'id_token' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ email: 'admin@medanki.dz', email_verified: true, name: 'Admin' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await service.handleCallback({ code: 'valid_google_code', state, platform: 'web' });
    expect(result.access_token).toBe('at');
    expect(result.refresh_token).toBe('rt');
    expect(result.user_id).toBe('u1');
  });
});
