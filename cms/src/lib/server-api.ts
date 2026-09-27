import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from './session-cookies';

function backendBase(): string {
  return (
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3000'
  );
}

/// Appel Nest depuis un Server Component : lit le cookie HttpOnly.
export async function serverBackendFetch<T>(path: string): Promise<T> {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) throw new Error('session absente');
  const res = await fetch(`${backendBase()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Platform': 'cms',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
