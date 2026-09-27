import { NextRequest, NextResponse } from 'next/server';
import { csrfAllowed } from '@/lib/csrf';
import {
  applySessionCookies,
  clearSessionCookies,
  REFRESH_COOKIE,
  ROLE_COOKIE,
} from '@/lib/session-cookies';

function backendBase(): string {
  return (
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3000'
  );
}

export async function POST(req: NextRequest) {
  if (!csrfAllowed({
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    host: req.headers.get('host') ?? '',
  })) {
    return NextResponse.json({ error: 'csrf' }, { status: 403 });
  }
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    const res = NextResponse.json({ error: 'session absente' }, { status: 401 });
    clearSessionCookies(res);
    return res;
  }
  const upstream = await fetch(`${backendBase()}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Platform': 'cms' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!upstream.ok) {
    const res = NextResponse.json({ error: 'refresh refusé' }, { status: 401 });
    clearSessionCookies(res);
    return res;
  }
  const data = (await upstream.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  };
  const res = NextResponse.json({ ok: true });
  applySessionCookies(res, {
    access: data.access_token,
    refresh: data.refresh_token,
    ...(req.cookies.get(ROLE_COOKIE)?.value
      ? { role: req.cookies.get(ROLE_COOKIE)!.value }
      : {}),
    accessMaxAge: data.expires_in ?? 900,
  });
  return res;
}
