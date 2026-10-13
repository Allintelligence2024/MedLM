import { NextResponse } from 'next/server';

export const ACCESS_COOKIE = 'cms_access';
export const REFRESH_COOKIE = 'cms_refresh';
export const PRESENT_COOKIE = 'cms_present';
export const ROLE_COOKIE = 'cms_role';

const REFRESH_MAX_AGE = 30 * 24 * 3600;

function secure(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function applySessionCookies(
  res: NextResponse,
  args: {
    access: string;
    refresh?: string;
    role?: string;
    accessMaxAge?: number;
  },
): void {
  const httpOnly = {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax' as const,
    path: '/',
  };
  const readable = {
    httpOnly: false,
    secure: secure(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  };
  res.cookies.set(ACCESS_COOKIE, args.access, {
    ...httpOnly,
    maxAge: args.accessMaxAge ?? 900,
  });
  if (args.refresh) {
    res.cookies.set(REFRESH_COOKIE, args.refresh, {
      ...httpOnly,
      maxAge: REFRESH_MAX_AGE,
    });
  }
  res.cookies.set(PRESENT_COOKIE, '1', readable);
  if (args.role) res.cookies.set(ROLE_COOKIE, args.role, readable);
}

export function clearSessionCookies(res: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, PRESENT_COOKIE, ROLE_COOKIE]) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}

export const CMS_ROLES = ['admin', 'editor', 'medical_reviewer', 'author'] as const;
