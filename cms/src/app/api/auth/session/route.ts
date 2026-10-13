import { NextRequest, NextResponse } from 'next/server';
import { csrfAllowed } from '@/lib/csrf';
import {
  applySessionCookies,
  CMS_ROLES,
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
  const body = (await req.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    return NextResponse.json({ error: 'access_token requis' }, { status: 400 });
  }
  const meRes = await fetch(`${backendBase()}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${body.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.json({ error: 'jeton refusé' }, { status: 401 });
  }
  const me = (await meRes.json()) as { role?: string; email?: string };
  if (!me.role || !(CMS_ROLES as readonly string[]).includes(me.role)) {
    return NextResponse.json({ error: 'rôle CMS refusé' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true, role: me.role, email: me.email });
  applySessionCookies(res, {
    access: body.access_token,
    ...(body.refresh_token ? { refresh: body.refresh_token } : {}),
    role: me.role,
    accessMaxAge: body.expires_in ?? 900,
  });
  return res;
}
