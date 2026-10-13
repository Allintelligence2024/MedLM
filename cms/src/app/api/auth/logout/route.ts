import { NextRequest, NextResponse } from 'next/server';
import { csrfAllowed } from '@/lib/csrf';
import { clearSessionCookies, REFRESH_COOKIE } from '@/lib/session-cookies';

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
  if (refresh) {
    await fetch(`${backendBase()}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform': 'cms' },
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => undefined);
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
