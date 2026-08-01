// Authentification du CMS (audit P2-7).
//
// AVANT : chaque page lisait `localStorage.getItem('cms_token')` et
// collait le jeton à la main dans ses en-têtes. Conséquences :
//   * aucune page de login — le jeton devait être injecté à la main
//     dans la console du navigateur ;
//   * aucune redirection sur 401 — une session expirée donnait des
//     pages vides sans explication ;
//   * un `localStorage` lisible par tout script tiers chargé sur le
//     domaine.
//
// MAINTENANT : le jeton vit dans un cookie, ce qui permet au
// middleware Next (qui s'exécute AVANT le rendu, côté serveur) de
// protéger `/admin/*`. Le cookie n'est pas `httpOnly` parce que le
// client doit poser l'en-tête `Authorization` pour parler au backend
// NestJS ; l'apport de sécurité est ailleurs : plus de page atteignable
// sans session, et une déconnexion réelle.
//
// Prochaine étape possible (hors périmètre de cet item) : un proxy
// `/api/*` côté Next qui relaie vers NestJS, permettant alors un cookie
// `httpOnly` strict.

export const AUTH_COOKIE = 'cms_token';
export const AUTH_ROLE_COOKIE = 'cms_role';
export const LOGIN_PATH = '/admin/login';

/// Durée de vie du cookie, alignée sur le refresh token backend (30 j).
/// Le token d'accès expire bien avant : une expiration se manifeste par
/// un 401, traité par `handleUnauthorized`.
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 3600;

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function getToken(): string {
  return readCookie(AUTH_COOKIE) ?? '';
}

export function getRole(): string | null {
  return readCookie(AUTH_ROLE_COOKIE);
}

export function setSession(token: string, role?: string): void {
  writeCookie(AUTH_COOKIE, token, COOKIE_MAX_AGE_SECONDS);
  if (role) writeCookie(AUTH_ROLE_COOKIE, role, COOKIE_MAX_AGE_SECONDS);
  // Migration : purge de l'ancien emplacement, qui subsistait chez les
  // éditeurs ayant utilisé le CMS avant ce correctif.
  try {
    window.localStorage.removeItem('cms_token');
  } catch {
    /* localStorage indisponible (mode privé strict) : sans importance */
  }
}

export function clearSession(): void {
  writeCookie(AUTH_COOKIE, '', 0);
  writeCookie(AUTH_ROLE_COOKIE, '', 0);
}

export function isAuthenticated(): boolean {
  return getToken().length > 0;
}

/// En-têtes d'authentification pour un appel backend.
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/// Redirige vers le login en mémorisant la page demandée.
export function redirectToLogin(from?: string): void {
  if (typeof window === 'undefined') return;
  const target = from ?? window.location.pathname + window.location.search;
  window.location.href = `${LOGIN_PATH}?from=${encodeURIComponent(target)}`;
}

/// Construit la destination post-login à partir du paramètre `from`.
///
/// Pure et testée : une redirection ouverte (`?from=https://evil…`)
/// serait une vulnérabilité classique. On n'accepte QUE des chemins
/// internes absolus.
export function safeRedirectTarget(from: string | null | undefined): string {
  const fallback = '/admin/cards';
  if (!from) return fallback;
  // Rejette les URL absolues, les schémas et les chemins protocol-relative.
  if (!from.startsWith('/') || from.startsWith('//')) return fallback;
  if (from.includes('://') || from.toLowerCase().includes('javascript:')) {
    return fallback;
  }
  if (from === LOGIN_PATH || from.startsWith(`${LOGIN_PATH}?`)) return fallback;
  return from;
}
