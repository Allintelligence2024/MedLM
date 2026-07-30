'use client';

// Page de gestion des signalements (card_reports) — Phase 11 bis.

import { useEffect, useState } from 'react';
import type { CardReport } from '@/lib/types';
import { CheckCircle2, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function ReportsPage() {
  const [reports, setReports] = useState<CardReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'investigating' | 'resolved' | 'dismissed' | 'all'>('pending');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/v1/content/reports`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('cms_token') ?? ''}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setReports((data.items ?? []) as CardReport[]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function updateStatus(id: string, status: 'investigating' | 'resolved' | 'dismissed') {
    try {
      const res = await fetch(`${API}/v1/content/reports/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('cms_token') ?? ''}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const filtered =
    filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  if (loading) return <div className="p-8">Chargement…</div>;
  if (error) return <div className="p-8 text-red-700">Erreur : {error}</div>;

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Signalements</h1>
        <p className="text-slate-600">
          Signalements utilisateurs sur les cartes (contenu erroné, source, etc.).
        </p>
      </header>

      <div className="flex gap-2">
        {(['pending', 'investigating', 'resolved', 'dismissed', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm ${
              filter === f
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f} ({reports.filter((r) => f === 'all' || r.status === f).length})
          </button>
        ))}
      </div>

      <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-100 text-left text-sm">
          <tr>
            <th className="px-4 py-2">Carte</th>
            <th className="px-4 py-2">Raison</th>
            <th className="px-4 py-2">Commentaire</th>
            <th className="px-4 py-2">Statut</th>
            <th className="px-4 py-2">Signalé le</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-slate-200">
              <td className="px-4 py-2 font-mono text-xs">{r.card_id.slice(0, 8)}…</td>
              <td className="px-4 py-2">{r.reason}</td>
              <td className="px-4 py-2 text-slate-600">{r.comment ?? '—'}</td>
              <td className="px-4 py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(r.status)}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-2 text-slate-500">
                {new Date(r.reported_at).toLocaleDateString('fr-FR')}
              </td>
              <td className="px-4 py-2">
                <div className="flex gap-1">
                  {r.status === 'pending' && (
                    <button
                      onClick={() => updateStatus(r.id, 'investigating')}
                      className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs hover:bg-amber-200"
                    >
                      Enquêter
                    </button>
                  )}
                  {r.status !== 'resolved' && (
                    <button
                      onClick={() => updateStatus(r.id, 'resolved')}
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs hover:bg-emerald-200"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Résoudre
                    </button>
                  )}
                  {r.status !== 'dismissed' && (
                    <button
                      onClick={() => updateStatus(r.id, 'dismissed')}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs hover:bg-slate-200"
                    >
                      <X className="h-3 w-3" />
                      Rejeter
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                Aucun signalement {filter !== 'all' ? `(${filter})` : ''}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'pending':
      return 'bg-amber-100 text-amber-800';
    case 'investigating':
      return 'bg-blue-100 text-blue-800';
    case 'resolved':
      return 'bg-emerald-100 text-emerald-800';
    case 'dismissed':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}
