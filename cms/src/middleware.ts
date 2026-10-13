// Middleware Next — /admin/* exige un access token que Nest accepte.
// Un cookie HttpOnly posé à la main sans signature correcte ne passe plus.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_COOKIE, clearSessionCookies } from '@/lib/session-cookies';
import { accessTokenAccepted } from '@/lib/verify-access';

const LOGIN_PATH = '/admin/login';

function loginRedirect(request: NextRequest, from?: string) {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = from ? `?from=${encodeURIComponent(from)}` : '';
  const res = NextResponse.redirect(url);
  clearSessionCookies(res);
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(ACCESS_COOKIE)?.value ?? '';

  if (pathname === LOGIN_PATH) {
    if (token && (await accessTokenAccepted(token))) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/cards';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!token || !(await accessTokenAccepted(token))) {
    return loginRedirect(request, pathname + search);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
