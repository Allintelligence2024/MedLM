// Client API CMS — toutes les requêtes Nest passent par le proxy
// same-origin `/api/backend` pour que le cookie HttpOnly voyage.
import { clearSession, isAuthenticated, redirectToLogin } from './auth';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/backend${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Platform': 'cms',
      ...(init?.headers ?? {}),
    },
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && isAuthenticated()) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshed.ok) {
      res = await raw(path, init);
    }
  }
  if (res.status === 401 && isAuthenticated()) {
    clearSession();
    redirectToLogin();
    throw new ApiError(401, 'session expirée');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface CardSummary {
  id: string;
  deck_id: string;
  type: string;
  status: string;
  version: number;
  is_premium: boolean;
  published_at: string | null;
  updated_at: string;
}
