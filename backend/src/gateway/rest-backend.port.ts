// RestBackend — port de délégation REST interne (Phase 20.2).
//
// Le gateway ne réimplémente AUCUNE logique métier : il délègue aux
// endpoints /v1 existants, avec le JWT de l'utilisateur forwardé
// (mêmes permissions, mêmes gardes — la passerelle n'élève rien).
//
// Injection par token pour rester testable sans réseau.

export interface RestBackend {
  get(
    path: string,
    args: { jwt: string; query: Record<string, string> },
  ): Promise<{ status: number; body: unknown }>;
}

export const REST_BACKEND = Symbol('REST_BACKEND');

/// Implémentation HTTP loopback (prod) — le gateway et l'API REST
/// vivent dans le même process : appel interne 127.0.0.1.
export class LoopbackRestBackend implements RestBackend {
  constructor(private readonly port: number) {}

  async get(
    path: string,
    args: { jwt: string; query: Record<string, string> },
  ): Promise<{ status: number; body: unknown }> {
    const qs = new URLSearchParams(args.query).toString();
    const url = `http://127.0.0.1:${this.port}/v1${path}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${args.jwt}`,
      },
      // Jamais de retry agressif ici : le budget coût protège déjà.
      signal: AbortSignal.timeout(5_000),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  }
}
