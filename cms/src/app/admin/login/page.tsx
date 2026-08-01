'use client';

// Page de connexion du CMS (audit P2-7).
//
// Il n'y en avait aucune : le jeton devait être posé à la main dans
// `localStorage` depuis la console du navigateur. C'était le principal
// obstacle à exposer le CMS hors du réseau interne.

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { setSession, safeRedirectTarget } from '@/lib/auth';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

/// Rôles autorisés à entrer dans le CMS.
///
/// Le backend fait respecter les permissions endpoint par endpoint ;
/// ce contrôle-ci évite seulement d'ouvrir une interface d'édition à un
/// étudiant, ce qui serait déroutant et donnerait des 403 partout.
const CMS_ROLES = ['admin', 'editor', 'reviewer', 'moderator'];

export default function LoginPage() {
  // `useSearchParams` force le rendu côté client : sans cette
  // frontière Suspense, le prérendu statique de Next échoue.
  return (
    <Suspense fallback={<div className="mx-auto max-w-sm py-16">Chargement…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'cms',
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'Identifiants refusés.'
            : `Connexion impossible (HTTP ${res.status}).`,
        );
        return;
      }
      const data = (await res.json()) as {
        access_token?: string;
        role?: string;
      };
      if (!data.access_token) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      if (data.role && !CMS_ROLES.includes(data.role)) {
        setError("Ce compte n'a pas accès au CMS.");
        return;
      }
      setSession(data.access_token, data.role);
      // Navigation dure plutôt que `router.replace` : la destination
      // est calculée à l'exécution, donc incompatible avec les routes
      // typées de Next. Un rechargement complet garantit aussi que le
      // middleware relit le cookie fraîchement posé.
      window.location.assign(safeRedirectTarget(params.get('from')));
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="text-xl font-semibold">Connexion au CMS</h1>
      <p className="mt-2 text-sm text-slate-600">
        Réservé aux comptes éditoriaux MedAnki DZ.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Adresse e-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || email.trim().length === 0}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:bg-slate-400"
        >
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
