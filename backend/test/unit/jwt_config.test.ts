// Tests de la faille JWT trouvée le 2026-08-01 en démarrant le binaire.
//
// LA FAILLE : sans `JWT_SIGNING_KEY_PATH`, `auth.module.ts` retombait
// SILENCIEUSEMENT sur un secret HS256 écrit en clair dans le code
// source — y compris avec NODE_ENV=production.
//
// Ce n'était pas théorique. Le serveur démarré ainsi acceptait ce jeton,
// forgé à la main en trois lignes de Python :
//
//   {"sub":"…","kind":"access","role":"admin"}  signé HS256
//   avec 'dev-only-secret-do-not-use-in-prod'
//
//   GET /v1/stats/me  →  200 OK
//
// Le secret étant dans le dépôt, n'importe qui pouvant lire le code
// pouvait usurper n'importe quel compte, rôle admin compris.
import { describe, it, expect } from 'vitest';
import {
  buildJwtConfig,
  InsecureJwtConfigError,
} from '../../src/auth/jwt-config';

const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----\n';
const readOk = () => FAKE_KEY;
const readFails = () => {
  throw new Error('ENOENT: no such file or directory');
};

describe('production — aucun repli tolérable', () => {
  it('REFUSE de démarrer sans JWT_SIGNING_KEY_PATH', () => {
    // C'est LE test de la faille : avant, cette configuration
    // retournait un secret en dur et le serveur démarrait.
    expect(() =>
      buildJwtConfig({
        keyPath: undefined,
        ttlSeconds: 900,
        nodeEnv: 'production',
        readKey: readOk,
      }),
    ).toThrow(InsecureJwtConfigError);
  });

  it('le message dit quoi faire, pas seulement que c\'est cassé', () => {
    try {
      buildJwtConfig({
        keyPath: undefined,
        ttlSeconds: 900,
        nodeEnv: 'production',
        readKey: readOk,
      });
      throw new Error('aurait dû jeter');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('JWT_SIGNING_KEY_PATH');
      expect(message).toContain('openssl genrsa');
      expect(message).toContain('admin');
    }
  });

  it('REFUSE une clé déclarée mais illisible', () => {
    // Se replier ici transformerait une faute de chemin en faille.
    expect(() =>
      buildJwtConfig({
        keyPath: './keys/absente.pem',
        ttlSeconds: 900,
        nodeEnv: 'production',
        readKey: readFails,
      }),
    ).toThrow(/illisible/);
  });

  it('REFUSE un fichier qui n\'est pas une clé privée PEM', () => {
    expect(() =>
      buildJwtConfig({
        keyPath: './keys/jwt-public.pem',
        ttlSeconds: 900,
        nodeEnv: 'production',
        readKey: () => '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      }),
    ).toThrow(/clé privée PEM/);
  });

  it('accepte une vraie clé privée et signe en RS256', () => {
    const config = buildJwtConfig({
      keyPath: './keys/jwt-private.pem',
      ttlSeconds: 900,
      nodeEnv: 'production',
      readKey: readOk,
    });
    expect(config.signOptions.algorithm).toBe('RS256');
    expect(config.privateKey).toBe(FAKE_KEY);
    expect(config.secret).toBeUndefined();
    expect(config.fallbackReason).toBeUndefined();
  });
});

describe('développement et test — repli autorisé mais sain', () => {
  for (const env of ['development', 'test', undefined]) {
    it(`NODE_ENV=${env ?? 'absent'} : repli HS256 accepté`, () => {
      const config = buildJwtConfig({
        keyPath: undefined,
        ttlSeconds: 900,
        nodeEnv: env,
        readKey: readOk,
      });
      expect(config.signOptions.algorithm).toBe('HS256');
      expect(config.secret).toBeTruthy();
    });
  }

  it('le secret de repli est ALÉATOIRE, jamais une constante du dépôt', () => {
    // C'est la racine du problème : une constante partagée par tous les
    // déploiements qui oublient la variable.
    const a = buildJwtConfig({
      keyPath: undefined,
      ttlSeconds: 900,
      nodeEnv: 'development',
      readKey: readOk,
    });
    const b = buildJwtConfig({
      keyPath: undefined,
      ttlSeconds: 900,
      nodeEnv: 'development',
      readKey: readOk,
    });
    expect(a.secret).not.toBe(b.secret);
    expect(a.secret).not.toContain('dev-only-secret');
    expect(a.secret!.length).toBeGreaterThanOrEqual(32);
  });

  it('le repli est BRUYANT (motif journalisable)', () => {
    // Un repli silencieux ne se distingue pas d'un démarrage sûr.
    const config = buildJwtConfig({
      keyPath: undefined,
      ttlSeconds: 900,
      nodeEnv: 'development',
      readKey: readOk,
    });
    expect(config.fallbackReason).toBeTruthy();
    expect(config.fallbackReason).toContain('JWT_SIGNING_KEY_PATH');
  });

  it('une clé fournie prime même hors production', () => {
    const config = buildJwtConfig({
      keyPath: './keys/jwt-private.pem',
      ttlSeconds: 900,
      nodeEnv: 'development',
      readKey: readOk,
    });
    expect(config.signOptions.algorithm).toBe('RS256');
  });
});

describe('TTL', () => {
  it('est propagé tel quel', () => {
    const config = buildJwtConfig({
      keyPath: undefined,
      ttlSeconds: 1800,
      nodeEnv: 'test',
      readKey: readOk,
    });
    expect(config.signOptions.expiresIn).toBe(1800);
  });
});
