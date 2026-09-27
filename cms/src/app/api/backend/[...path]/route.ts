import { NextRequest, NextResponse } from 'next/server';
import { csrfAllowed } from '@/lib/csrf';
import {
  ACCESS_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  REFRESH_COOKIE,
} from '@/lib/session-cookies';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function backendBase(): string {
  return (
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3000'
  );
}

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  if (MUTATING.has(req.method) && !csrfAllowed({
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    host: req.headers.get('host') ?? '',
  })) {
    return NextResponse.json({ error: 'csrf' }, { status: 403 });
  }
  const target = `${backendBase()}/${path.join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const platform = req.headers.get('x-platform');
  headers.set('X-Platform', platform ?? 'cms');
  const device = req.headers.get('x-device-id');
  if (device) headers.set('X-Device-Id', device);
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (access) headers.set('Authorization', `Bearer ${access}`);

  const body = MUTATING.has(req.method) ? await req.arrayBuffer() : undefined;
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: 'manual',
  });

  const resHeaders = new Headers();
  const pass = ['content-type', 'cache-control'];
  for (const key of pass) {
    const value = upstream.headers.get(key);
    if (value) resHeaders.set(key, value);
  }
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}

// Utilisé par /api/auth/refresh — pas un leak, les cookies restent HttpOnly.
export { applySessionCookies, clearSessionCookies, REFRESH_COOKIE };
