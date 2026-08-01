'use client';

// Formulaire de création d'un partenariat faculté (Phase 20.4).
//
// Branché sur POST /v1/partnerships (rôle editor+). Le serveur crée
// TOUJOURS un brouillon (`status: 'draft'` côté service) — l'activation
// passe ensuite par la machine à états (signature + unicité active/faculté).
//
// La liste des facultés est recopiée de l'allow-list source unique
// backend/src/partnerships/faculties.ts — check_partnerships.py
// interdit toute dérive (le backend rejettera de toute façon une
// faculté hors allow-list, message renvoyé à l'utilisateur).

import { useState } from 'react';
import { X } from 'lucide-react';

/// Miroir de FACULTIES_DZ (backend/src/partnerships/faculties.ts).
/// Le backend reste l'autorité : valeur inconnue → 400 explicite.
const FACULTIES = [
  'Alger',
  'Oran',
  'Constantine',
  'Sidi Bel Abbes',
  'Tlemcen',
  'Batna',
  'Setif',
  'Blida',
  'Annaba',
  'Tizi Ouzou',
] as const;

interface Props {
  apiBaseUrl: string;
  token: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePartnershipDialog({
  apiBaseUrl,
  token,
  onClose,
  onCreated,
}: Props) {
  const [faculty, setFaculty] = useState<string>(FACULTIES[0]);
  const [contactEmail, setContactEmail] = useState('');
  const [scope, setScope] = useState('');
  const [commissionPct, setCommissionPct] = useState(0);
  const [signedAt, setSignedAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        faculty,
        contact_email: contactEmail.trim(),
        scope: scope
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        commission_pct: Math.round(commissionPct),
        ...(signedAt
          ? { signed_at: new Date(`${signedAt}T00:00:00.000Z`).toISOString() }
          : {}),
      };
      const res = await fetch(`${apiBaseUrl}/v1/partnerships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(await readError(res));
      }
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nouveau partenariat"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Nouveau partenariat</h2>
            <p className="text-sm text-slate-600">
              Créé en <strong>brouillon</strong> : l&apos;activation
              exige une signature et reste unique par faculté.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Faculté *</span>
            <select
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              className="w-full rounded border px-2 py-1.5"
            >
              {FACULTIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email de contact *</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="doyen@univ-oran1.dz"
              className="w-full rounded border px-2 py-1.5"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Périmètre (modules, séparés par virgule)
            </span>
            <input
              type="text"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="anatomie, physiologie"
              className="w-full rounded border px-2 py-1.5"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Commission (0–50 %)
              </span>
              <input
                type="number"
                min={0}
                max={50}
                value={commissionPct}
                onChange={(e) =>
                  setCommissionPct(
                    e.target.value === '' ? 0 : Number(e.target.value),
                  )
                }
                className="w-full rounded border px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Signé le (optionnel)
              </span>
              <input
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
                className="w-full rounded border px-2 py-1.5"
              />
            </label>
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="rounded border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={submitting || !emailValid}
              title={emailValid ? '' : 'Email de contact invalide'}
              className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Création…' : 'Créer le brouillon'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/// Lit le corps d'erreur JSON NestJS ({ message: string | string[] })
/// ou retombe sur le texte brut / le statut HTTP.
async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(json.message)) return json.message.join(' ; ');
    if (typeof json.message === 'string') return json.message;
  } catch {
    // pas du JSON — on garde le texte brut
  }
  return `HTTP ${res.status}${text ? ` — ${text}` : ''}`;
}
