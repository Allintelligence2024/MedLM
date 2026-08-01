'use client';

// Page « Partenariats facultés » (Phase 20.4, endpoint /v1/partnerships).
//
// Lecture : rôle author+. Création/transitions : rôle editor+.
// La machine à états est côté serveur (partnership-status.ts) — le CMS
// ne propose que les transitions valides.

import { useCallback, useEffect, useState } from 'react';
import { Handshake, PlusCircle } from 'lucide-react';
import { CreatePartnershipDialog } from './create_partnership_dialog';
import { getToken } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

type PartnershipStatus = 'draft' | 'active' | 'suspended' | 'terminated';

interface Partnership {
  id: string;
  faculty: string;
  contactEmail: string;
  status: PartnershipStatus;
  scope: string[];
  commissionPct: number;
  signedAt: string | null;
  createdAt: string;
}

const NEXT_ACTIONS: Record<PartnershipStatus, PartnershipStatus[]> = {
  draft: ['active', 'terminated'],
  active: ['suspended', 'terminated'],
  suspended: ['active', 'terminated'],
  terminated: [],
};

export default function PartnershipsPage() {
  const [items, setItems] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);

  const token = () => getToken();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/v1/partnerships`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems((data.items ?? []) as Partnership[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function transition(id: string, status: PartnershipStatus) {
    try {
      const res = await fetch(`${API}/v1/partnerships/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} — ${text}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const filtered =
    filter === 'all' ? items : items.filter((p) => p.status === filter);

  if (loading) return <div className="p-8">Chargement…</div>;

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Handshake className="h-6 w-6" /> Partenariats facultés
          </h1>
          <p className="text-slate-600">
            Accords de co-production de contenu avec les facultés de
            médecine (redevance en DZD, périmètre par module). Un seul
            partenariat <strong>actif</strong> par faculté.
          </p>
        </div>
        <button
          className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
          onClick={() => setCreating(true)}
        >
          <PlusCircle className="h-4 w-4" /> Nouveau brouillon
        </button>
      </header>

      <div className="flex gap-2">
        {(['all', 'draft', 'active', 'suspended', 'terminated'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1 text-sm ${
              filter === f
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f === 'all' ? 'tous' : f} (
            {items.filter((p) => f === 'all' || p.status === f).length})
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {creating && (
        <CreatePartnershipDialog
          apiBaseUrl={API}
          token={token()}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      <table className="w-full overflow-hidden rounded-lg border border-slate-200">
        <thead className="bg-slate-100 text-left text-sm">
          <tr>
            <th className="px-4 py-2">Faculté</th>
            <th className="px-4 py-2">Contact</th>
            <th className="px-4 py-2">Statut</th>
            <th className="px-4 py-2">Commission</th>
            <th className="px-4 py-2">Périmètre</th>
            <th className="px-4 py-2">Signé le</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {filtered.map((p) => (
            <tr key={p.id} className="border-t border-slate-200">
              <td className="px-4 py-2 font-semibold">{p.faculty}</td>
              <td className="px-4 py-2 text-slate-600">{p.contactEmail}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor(p.status)}`}>
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-2">{p.commissionPct} %</td>
              <td className="px-4 py-2 text-slate-600">
                {p.scope.length > 0 ? p.scope.join(', ') : '—'}
              </td>
              <td className="px-4 py-2 text-slate-500">
                {p.signedAt
                  ? new Date(p.signedAt).toLocaleDateString('fr-FR')
                  : '—'}
              </td>
              <td className="px-4 py-2">
                <div className="flex gap-1">
                  {NEXT_ACTIONS[p.status].map((to) => (
                    <button
                      key={to}
                      onClick={() => transition(p.id, to)}
                      className={`rounded px-2 py-1 text-xs ${actionColor(to)}`}
                    >
                      {actionLabel(to)}
                    </button>
                  ))}
                  {NEXT_ACTIONS[p.status].length === 0 && (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                Aucun partenariat {filter !== 'all' ? `(${filter})` : ''}.
                Les accords se créent en brouillon puis s'activent après
                signature.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function statusColor(s: PartnershipStatus): string {
  switch (s) {
    case 'draft':
      return 'bg-slate-100 text-slate-700';
    case 'active':
      return 'bg-emerald-100 text-emerald-800';
    case 'suspended':
      return 'bg-amber-100 text-amber-800';
    case 'terminated':
      return 'bg-red-100 text-red-800';
  }
}

function actionLabel(to: PartnershipStatus): string {
  switch (to) {
    case 'active':
      return 'Activer';
    case 'suspended':
      return 'Suspendre';
    case 'terminated':
      return 'Terminer';
    default:
      return to;
  }
}

function actionColor(to: PartnershipStatus): string {
  switch (to) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
    case 'suspended':
      return 'bg-amber-100 text-amber-800 hover:bg-amber-200';
    case 'terminated':
      return 'bg-red-100 text-red-800 hover:bg-red-200';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
