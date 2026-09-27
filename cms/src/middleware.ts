// Middleware Next — protège /admin/* (présence du cookie HttpOnly).
// La signature JWT reste validée par Nest ; un cookie posé à la main
// sans signature correcte donne 401 sur le proxy.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'cms_access';
const LEGACY_COOKIE = 'cms_token';
const LOGIN_PATH = '/admin/login';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === LOGIN_PATH) {
    if (request.cookies.get(AUTH_COOKIE)?.value) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/cards';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const token =
    request.cookies.get(AUTH_COOKIE)?.value ??
    request.cookies.get(LEGACY_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?from=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
