// Tests audit P1-3 — authentification FCM par compte de service.
//
// Le bug corrigé : `FIREBASE_ACCESS_TOKEN` était lu tel quel depuis
// l'environnement. Un access token Google vit ~1 h ; en production
// l'envoi de notifications se serait donc arrêté au bout d'une heure,
// sans autre signal qu'un warning par notification perdue.
//
// Ce qui compte et qui est testé ici : la RÈGLE de renouvellement
// (marge anticipée), le parsing du compte de service (y compris les
// `\n` littéraux introduits par les variables d'environnement) et
// l'interprétation de la réponse de Google.
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  buildAssertion,
  isTokenUsable,
  parseServiceAccount,
  parseTokenResponse,
  FCM_SCOPE,
  GOOGLE_TOKEN_URI,
  REFRESH_MARGIN_MS,
  type CachedToken,
} from '../../src/notifications/fcm/fcm-oauth';

const NOW = 1_800_000_000_000;

function token(expiresAtMs: number, accessToken = 'ya29.test'): CachedToken {
  return { accessToken, expiresAtMs };
}

describe('isTokenUsable — renouvellement anticipé', () => {
  it('rejette l\'absence de token', () => {
    expect(isTokenUsable(null, NOW)).toBe(false);
  });

  it('rejette un token vide', () => {
    expect(isTokenUsable(token(NOW + 3_600_000, ''), NOW)).toBe(false);
  });

  it('accepte un token largement valide', () => {
    expect(isTokenUsable(token(NOW + 3_600_000), NOW)).toBe(true);
  });

  it('rejette un token expiré', () => {
    expect(isTokenUsable(token(NOW - 1), NOW)).toBe(false);
  });

  it('rejette DANS la marge, avant expiration réelle', () => {
    // C'est tout l'intérêt : ne pas découvrir l'expiration en
    // recevant un 401 sur une notification qu'on voulait envoyer.
    const justInsideMargin = NOW + REFRESH_MARGIN_MS - 1_000;
    expect(isTokenUsable(token(justInsideMargin), NOW)).toBe(false);
  });

  it('accepte juste au-delà de la marge', () => {
    expect(isTokenUsable(token(NOW + REFRESH_MARGIN_MS + 1_000), NOW)).toBe(true);
  });

  it('la marge est paramétrable', () => {
    const t = token(NOW + 60_000);
    expect(isTokenUsable(t, NOW, 10_000)).toBe(true);
    expect(isTokenUsable(t, NOW, 120_000)).toBe(false);
  });
});

describe('parseServiceAccount', () => {
  it('retourne null sur une entrée vide ou absente', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount(null)).toBeNull();
    expect(parseServiceAccount('   ')).toBeNull();
  });

  it('retourne null (sans jeter) sur du JSON invalide', () => {
    // Une mauvaise configuration doit dégrader les notifications,
    // jamais empêcher l'API de démarrer.
    expect(parseServiceAccount('{ pas du json')).toBeNull();
  });

  it('retourne null si client_email ou private_key manque', () => {
    expect(parseServiceAccount(JSON.stringify({ client_email: 'a@b.c' }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ private_key: 'x' }))).toBeNull();
  });

  it('déséchappe les \\n littéraux de la clé PEM', () => {
    // Cas réel : le JSON passé par variable d'environnement contient
    // « \n » en deux caractères, et importPKCS8 refuse une telle clé.
    const raw = JSON.stringify({
      client_email: 'svc@medanki.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n',
      project_id: 'medanki-dz',
    });
    const acc = parseServiceAccount(raw);
    expect(acc).not.toBeNull();
    expect(acc!.private_key).toContain('\n');
    expect(acc!.private_key).not.toContain('\\n');
    expect(acc!.project_id).toBe('medanki-dz');
  });

  it('préserve une clé déjà correctement formée', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n';
    const acc = parseServiceAccount(
      JSON.stringify({ client_email: 'a@b.c', private_key: key }),
    );
    expect(acc!.private_key).toBe(key);
  });
});

describe('parseTokenResponse', () => {
  it('rejette une réponse non exploitable', () => {
    expect(parseTokenResponse(null, NOW)).toBeNull();
    expect(parseTokenResponse('nope', NOW)).toBeNull();
    expect(parseTokenResponse({}, NOW)).toBeNull();
    expect(parseTokenResponse({ access_token: '' }, NOW)).toBeNull();
  });

  it('calcule l\'expiration absolue à partir de expires_in', () => {
    const parsed = parseTokenResponse(
      { access_token: 'ya29.abc', expires_in: 3599 },
      NOW,
    );
    expect(parsed).toEqual({
      accessToken: 'ya29.abc',
      expiresAtMs: NOW + 3_599_000,
    });
  });

  it('retombe sur 1 h si expires_in est absent ou aberrant', () => {
    expect(parseTokenResponse({ access_token: 'a' }, NOW)!.expiresAtMs).toBe(
      NOW + 3_600_000,
    );
    expect(
      parseTokenResponse({ access_token: 'a', expires_in: 'soon' }, NOW)!.expiresAtMs,
    ).toBe(NOW + 3_600_000);
  });

  it('un token fraîchement échangé est immédiatement utilisable', () => {
    const parsed = parseTokenResponse({ access_token: 'a', expires_in: 3600 }, NOW);
    expect(isTokenUsable(parsed, NOW)).toBe(true);
  });
});

describe('buildAssertion — JWT bearer Google', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const account = {
    client_email: 'svc@medanki.iam.gserviceaccount.com',
    private_key: privateKey,
  };

  it('produit un JWT RS256 avec les revendications attendues', async () => {
    const jwt = await buildAssertion(account, NOW);
    const [header, payload] = jwt
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')));

    expect(header.alg).toBe('RS256');
    expect(payload.iss).toBe(account.client_email);
    expect(payload.sub).toBe(account.client_email);
    expect(payload.aud).toBe(GOOGLE_TOKEN_URI);
    expect(payload.scope).toBe(FCM_SCOPE);
    expect(payload.iat).toBe(Math.floor(NOW / 1000));
    // Google refuse toute assertion de plus d'une heure.
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('honore un token_uri personnalisé (émulateur, proxy)', async () => {
    const jwt = await buildAssertion(
      { ...account, token_uri: 'https://oauth.example/token' },
      NOW,
    );
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'),
    );
    expect(payload.aud).toBe('https://oauth.example/token');
  });
});
