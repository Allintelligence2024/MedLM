/// Authentification OAuth2 pour FCM v1 — logique pure, testable.
///
/// AUDIT P1-3 : `FcmProvider._getAccessToken()` lisait un
/// `FIREBASE_ACCESS_TOKEN` statique depuis l'environnement. Or un access
/// token Google expire en ~1 h : en production, l'envoi de notifications
/// se serait arrêté au bout d'une heure, silencieusement (le provider
/// journalise un warning et retourne `sent: false`). Le commentaire du
/// fichier annonçait `google-auth-library` — jamais branchée.
///
/// Correctif : le flux officiel « JWT bearer » de Google.
///   1. on signe un JWT RS256 avec la clé privée du compte de service ;
///   2. on l'échange contre un access token sur oauth2.googleapis.com ;
///   3. on met l'access token en cache et on le renouvelle AVANT
///      expiration (marge de sécurité), pas après un échec.
///
/// Ce fichier ne contient aucune dépendance NestJS : il est
/// directement testable (cf. test/unit/fcm_oauth.test.ts).
import { SignJWT, importPKCS8 } from 'jose';

/// Portée minimale nécessaire pour l'API FCM v1.
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/// Fraction du sous-ensemble d'un JSON de compte de service Google
/// dont on a réellement besoin.
export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
}

/// Marge de renouvellement : on considère un token « expiré » 5 min
/// avant sa vraie expiration. Renouveler après coup signifierait des
/// notifications perdues pendant la fenêtre d'échec.
export const REFRESH_MARGIN_MS = 5 * 60_000;

export interface CachedToken {
  accessToken: string;
  /// Timestamp epoch ms d'expiration réelle annoncée par Google.
  expiresAtMs: number;
}

/// Le token en cache est-il encore utilisable à l'instant `nowMs` ?
///
/// Pur, sans I/O : c'est la règle qui compte, et elle doit être testée
/// sans réseau ni horloge réelle.
export function isTokenUsable(
  cached: CachedToken | null,
  nowMs: number,
  marginMs: number = REFRESH_MARGIN_MS,
): boolean {
  if (!cached) return false;
  if (!cached.accessToken) return false;
  return cached.expiresAtMs - marginMs > nowMs;
}

/// Parse un compte de service depuis un JSON brut.
///
/// Retourne `null` plutôt que de jeter : une mauvaise configuration
/// doit dégrader le service de notification, jamais empêcher l'API de
/// démarrer.
export function parseServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (
      typeof parsed.client_email !== 'string' ||
      typeof parsed.private_key !== 'string' ||
      !parsed.client_email ||
      !parsed.private_key
    ) {
      return null;
    }
    // Les JSON de compte de service transportent les sauts de ligne
    // de la clé PEM sous forme littérale « \n » dès qu'ils transitent
    // par une variable d'environnement.
    const privateKey = parsed.private_key.includes('\\n')
      ? parsed.private_key.replace(/\\n/g, '\n')
      : parsed.private_key;
    return {
      client_email: parsed.client_email,
      private_key: privateKey,
      ...(parsed.project_id ? { project_id: parsed.project_id } : {}),
      ...(parsed.token_uri ? { token_uri: parsed.token_uri } : {}),
    };
  } catch {
    return null;
  }
}

/// Construit l'assertion JWT attendue par le flux « JWT bearer ».
export async function buildAssertion(
  account: ServiceAccount,
  nowMs: number,
  scope: string = FCM_SCOPE,
): Promise<string> {
  const key = await importPKCS8(account.private_key, 'RS256');
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(account.token_uri ?? GOOGLE_TOKEN_URI)
    .setIssuedAt(iat)
    // Google refuse toute assertion de plus d'une heure.
    .setExpirationTime(iat + 3600)
    .sign(key);
}

/// Interprète la réponse du point d'échange de jetons.
export function parseTokenResponse(
  body: unknown,
  nowMs: number,
): CachedToken | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { access_token?: unknown; expires_in?: unknown };
  if (typeof b.access_token !== 'string' || !b.access_token) return null;
  const expiresIn =
    typeof b.expires_in === 'number' && Number.isFinite(b.expires_in)
      ? b.expires_in
      : 3600;
  return {
    accessToken: b.access_token,
    expiresAtMs: nowMs + expiresIn * 1000,
  };
}
