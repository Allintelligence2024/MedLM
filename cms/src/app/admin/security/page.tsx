'use client';

// Rotation TOTP admin. L'ancien secret reste actif jusqu'à confirmation.

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

export default function SecurityPage() {
  const [current, setCurrent] = useState('');
  const [nextCode, setNextCode] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [backups, setBackups] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setBackups(null);
    try {
      const data = await apiFetch<{ otpauth_url: string; secret_base32: string }>(
        '/v1/auth/mfa/replace/begin',
        { method: 'POST', body: JSON.stringify({ current_code: current }) },
      );
      setSecret(data.secret_base32);
      setOtpauth(data.otpauth_url);
      setCurrent('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Refus.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ backup_codes: string[] }>(
        '/v1/auth/mfa/replace/confirm',
        { method: 'POST', body: JSON.stringify({ new_code: nextCode }) },
      );
      setBackups(data.backup_codes);
      setSecret(null);
      setOtpauth(null);
      setNextCode('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Refus.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold">Sécurité</h1>
      <p className="text-sm text-slate-600">
        Remplacement TOTP (SHA1, 30 s). L&apos;ancien code reste valable tant
        que le nouveau n&apos;est pas confirmé. Les codes de secours sont
        régénérés à la confirmation.
      </p>

      {!secret && !backups && (
        <form onSubmit={begin} className="space-y-3">
          <label className="block text-sm font-medium">
            Code TOTP actuel
            <input
              inputMode="numeric"
              maxLength={6}
              value={current}
              onChange={(e) => setCurrent(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy || current.length !== 6}
            className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:bg-slate-400"
          >
            Générer un nouveau secret
          </button>
        </form>
      )}

      {secret && (
        <form onSubmit={confirm} className="space-y-3">
          <p className="text-sm">Scannez puis saisissez un code du nouvel appareil :</p>
          <code className="block break-all rounded bg-slate-100 p-2 text-xs">{secret}</code>
          {otpauth && <p className="break-all text-xs text-slate-500">{otpauth}</p>}
          <label className="block text-sm font-medium">
            Nouveau code TOTP
            <input
              inputMode="numeric"
              maxLength={6}
              value={nextCode}
              onChange={(e) => setNextCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy || nextCode.length !== 6}
            className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:bg-slate-400"
          >
            Confirmer le remplacement
          </button>
        </form>
      )}

      {backups && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium">Nouveaux codes de secours (une seule fois) :</p>
          <ul className="mt-2 list-disc pl-5 font-mono">
            {backups.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
