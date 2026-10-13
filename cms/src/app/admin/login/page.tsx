'use client';

// Login CMS : magic link + MFA admin. Le JWT n'est jamais stocké en JS.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { safeRedirectTarget } from '@/lib/auth';
import { apiFetch, ApiError } from '@/lib/api';

type Gate =
  | { kind: 'idle' }
  | { kind: 'link_sent' }
  | { kind: 'enroll'; enrollment_token: string; otpauth_url: string; secret_base32: string }
  | { kind: 'mfa'; mfa_token: string };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-sm py-16">Chargement…</div>}>
      <LoginForm />
    </Suspense>
  );
}

async function establishSession(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): Promise<void> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `session ${res.status}`);
  }
}

async function consumeAuthPayload(
  data: Record<string, unknown>,
  setGate: (g: Gate) => void,
  onSession: () => void,
): Promise<void> {
  if (typeof data.access_token === 'string') {
    await establishSession({
      access_token: data.access_token,
      ...(typeof data.refresh_token === 'string' ? { refresh_token: data.refresh_token } : {}),
      ...(typeof data.expires_in === 'number' ? { expires_in: data.expires_in } : {}),
    });
    onSession();
    return;
  }
  if (data.status === 'mfa_enrollment_required' && typeof data.enrollment_token === 'string') {
    const setup = await apiFetch<{ otpauth_url: string; secret_base32: string }>(
      '/v1/auth/mfa/setup',
      {
        method: 'POST',
        body: JSON.stringify({ enrollment_token: data.enrollment_token }),
      },
    );
    setGate({
      kind: 'enroll',
      enrollment_token: data.enrollment_token,
      otpauth_url: setup.otpauth_url,
      secret_base32: setup.secret_base32,
    });
    return;
  }
  if (data.status === 'mfa_required' && typeof data.mfa_token === 'string') {
    setGate({ kind: 'mfa', mfa_token: data.mfa_token });
    return;
  }
  throw new Error('Réponse inattendue du serveur.');
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [magicToken, setMagicToken] = useState(params.get('token') ?? '');
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate>({ kind: 'idle' });
  const [autoTried, setAutoTried] = useState(false);

  function go() {
    window.location.assign(safeRedirectTarget(params.get('from')));
  }

  useEffect(() => {
    if (autoTried || !magicToken.trim()) return;
    setAutoTried(true);
    void (async () => {
      setBusy(true);
      try {
        const data = await apiFetch<Record<string, unknown>>(
          `/v1/auth/magic-link/verify?token=${encodeURIComponent(magicToken.trim())}`,
        );
        await consumeAuthPayload(data, setGate, go);
      } catch {
        /* l'utilisateur pourra coller le jeton à la main */
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicToken, autoTried]);

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setGate({ kind: 'link_sent' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyToken(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<Record<string, unknown>>(
        `/v1/auth/magic-link/verify?token=${encodeURIComponent(magicToken.trim())}`,
      );
      await consumeAuthPayload(data, setGate, go);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Jeton refusé.');
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (gate.kind === 'enroll') {
        const data = await apiFetch<Record<string, unknown>>('/v1/auth/mfa/enable', {
          method: 'POST',
          body: JSON.stringify({ enrollment_token: gate.enrollment_token, code: totp }),
        });
        await consumeAuthPayload(data, setGate, go);
        return;
      }
      if (gate.kind === 'mfa') {
        const data = await apiFetch<Record<string, unknown>>('/v1/auth/mfa/verify', {
          method: 'POST',
          body: JSON.stringify({ mfa_token: gate.mfa_token, code: totp }),
        });
        await consumeAuthPayload(data, setGate, go);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Code refusé.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="text-xl font-semibold">Connexion au CMS</h1>
      <p className="mt-2 text-sm text-slate-600">
        Magic link. Les comptes admin exigent un TOTP RFC 6238. Le jeton
        d&apos;accès n&apos;est pas lisible par le JavaScript.
      </p>

      {(gate.kind === 'idle' || gate.kind === 'link_sent') && (
        <>
          <form onSubmit={requestLink} className="mt-8 space-y-4">
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
            <button
              type="submit"
              disabled={busy || email.trim().length === 0}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:bg-slate-400"
            >
              {busy ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
          <form onSubmit={verifyToken} className="mt-8 space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium">
                Jeton magic link
              </label>
              <input
                id="token"
                type="text"
                value={magicToken}
                onChange={(e) => setMagicToken(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={busy || magicToken.trim().length === 0}
              className="w-full rounded-md border border-slate-300 px-4 py-2 disabled:bg-slate-100"
            >
              Valider le jeton
            </button>
          </form>
        </>
      )}

      {gate.kind === 'link_sent' && (
        <p className="mt-8 text-sm text-slate-700">
          Si le compte existe, un lien a été envoyé. Collez le jeton ci-dessus
          si votre mail pointe vers l&apos;API plutôt que vers le CMS.
        </p>
      )}

      {gate.kind === 'enroll' && (
        <form onSubmit={submitTotp} className="mt-8 space-y-4">
          <p className="text-sm">
            Scannez ce secret dans une appli TOTP (SHA1, 30s, 6 chiffres) :
          </p>
          <code className="block break-all rounded bg-slate-100 p-2 text-xs">
            {gate.secret_base32}
          </code>
          <p className="break-all text-xs text-slate-500">{gate.otpauth_url}</p>
          <TotpField value={totp} onChange={setTotp} busy={busy} />
          <button
            type="submit"
            disabled={busy || totp.length !== 6}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:bg-slate-400"
          >
            Activer la MFA
          </button>
        </form>
      )}

      {gate.kind === 'mfa' && (
        <form onSubmit={submitTotp} className="mt-8 space-y-4">
          <TotpField value={totp} onChange={setTotp} busy={busy} />
          <button
            type="submit"
            disabled={busy || totp.length !== 6}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:bg-slate-400"
          >
            Vérifier
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function TotpField(props: {
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
}) {
  return (
    <div>
      <label htmlFor="totp" className="block text-sm font-medium">
        Code TOTP
      </label>
      <input
        id="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={props.busy}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
      />
    </div>
  );
}
