// Client API côté CMS — parle au backend NestJS.
//
// Audit P2-7 : l'authentification est désormais centralisée ici. Avant,
// chaque page collait `localStorage.getItem('cms_token')` dans ses
// en-têtes à la main, et un 401 se traduisait par une page vide sans
// explication. `apiFetch` pose le jeton et redirige vers le login quand
// la session est expirée.
import { authHeaders, clearSession, redirectToLogin } from './auth';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

/// Erreur d'API typée — permet aux appelants de distinguer un 404
/// d'une panne réseau.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    // Session expirée ou révoquée : on nettoie et on renvoie vers le
    // login plutôt que d'afficher une page vide.
    clearSession();
    redirectToLogin();
    throw new ApiError(401, 'session expirée');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `API ${res.status}: ${text}`);
  }
  // 204 No Content : `res.json()` jetterait sur un corps vide.
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
