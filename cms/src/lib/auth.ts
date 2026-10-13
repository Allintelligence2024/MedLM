// Session CMS : le JWT vit dans un cookie HttpOnly posé par
// `/api/auth/session`. Le JS ne lit qu'un drapeau `cms_present` et le
// rôle affiché — jamais le jeton. Les appels Nest passent par le proxy
// `/api/backend/*` (credentials: 'include').

export const AUTH_COOKIE = 'cms_access';
export const AUTH_PRESENT_COOKIE = 'cms_present';
export const AUTH_ROLE_COOKIE = 'cms_role';
export const LOGIN_PATH = '/admin/login';

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

export function getRole(): string | null {
  return readCookie(AUTH_ROLE_COOKIE);
}

export function isAuthenticated(): boolean {
  return readCookie(AUTH_PRESENT_COOKIE) === '1' || Boolean(readCookie(AUTH_COOKIE));
}

export function clearSession(): void {
  writeCookie(AUTH_PRESENT_COOKIE, '', 0);
  writeCookie(AUTH_ROLE_COOKIE, '', 0);
  writeCookie(AUTH_COOKIE, '', 0);
  writeCookie('cms_token', '', 0);
  try {
    window.localStorage.removeItem('cms_token');
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  }
}

export function redirectToLogin(from?: string): void {
  if (typeof window === 'undefined') return;
  const target = from ?? window.location.pathname + window.location.search;
  window.location.href = `${LOGIN_PATH}?from=${encodeURIComponent(target)}`;
}

export function safeRedirectTarget(from: string | null | undefined): string {
  const fallback = '/admin/cards';
  if (!from) return fallback;
  if (!from.startsWith('/') || from.startsWith('//')) return fallback;
  if (from.includes('://') || from.toLowerCase().includes('javascript:')) {
    return fallback;
  }
  if (from === LOGIN_PATH || from.startsWith(`${LOGIN_PATH}?`)) return fallback;
  return from;
}
