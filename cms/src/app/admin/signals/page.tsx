'use client';

// Page « Signaux IA » — file de revue des cartes qui font échouer de
// nombreux étudiants (Phase 19.5, endpoint 18.4).
//
// Rôle requis : author+ pour la liste, editor+ pour le balayage.
// Un signal ouvert signifie : la difficulté vient peut-être de la
// CARTE (formulation, distracteur, fait non atomique) — l'auteur doit
// la relire, puis résoudre ou ignorer le signal.

import { useCallback, useEffect, useState } from 'react';
import type {
  DifficultySignal,
  SignalStatus,
  SignalsListResponse,
  SignalsScanResponse,
} from '@/lib/signals';
import { Radar, RefreshCw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function SignalsPage() {
  const [signals, setSignals] = useState<DifficultySignal[]>([]);
  const [status, setStatus] = useState<SignalStatus>('open');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<SignalsScanResponse | null>(null);

  const token = () => localStorage.getItem('cms_token') ?? '';

  const load = useCallback(async (s: SignalStatus) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/v1/ai/adaptive/signals?status=${s}&limit=100`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SignalsListResponse;
      setSignals(data.signals ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(`${API}/v1/ai/adaptive/signals/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SignalsScanResponse;
      setScanResult(data);
      await load(status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Signaux de difficulté IA</h1>
          <p className="text-slate-600">
            Cartes échouées de façon répétée par de nombreux étudiants
            (fenêtre glissante). À relire en priorité : la difficulté
            vient peut-être de la carte, pas des étudiants.
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {scanning ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Radar className="h-4 w-4" />
          )}
          Lancer un balayage
        </button>
      </header>

      <div className="flex gap-2">
        {(['open', 'resolved', 'ignored'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded px-3 py-1 text-sm ${
              status === s
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {s === 'open' ? 'ouverts' : s === 'resolved' ? 'résolus' : 'ignorés'}
          </button>
        ))}
      </div>

      {scanResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Balayage terminé : {scanResult.new_signals} nouveaux signaux sur{' '}
          {scanResult.candidate_cards} cartes candidates (fenêtre{' '}
          {scanResult.window_days} j · seuils ≥{scanResult.min_lapses_per_user}{' '}
          lapses/utilisateur, ≥{scanResult.min_affected_users} utilisateurs).
          {scanResult.skipped_existing > 0 &&
            ` ${scanResult.skipped_existing} déjà ouverts (idempotent).`}
        </div>
      )}

      {loading && <div className="p-8">Chargement…</div>}
      {error && <div className="p-8 text-red-700">Erreur : {error}</div>}

      {!loading && !error && (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200">
          <thead className="bg-slate-100 text-left text-sm">
            <tr>
              <th className="px-4 py-2">Carte</th>
              <th className="px-4 py-2">Raison</th>
              <th className="px-4 py-2">Étudiants affectés</th>
              <th className="px-4 py-2">Lapses cumulés</th>
              <th className="px-4 py-2">Fenêtre</th>
              <th className="px-4 py-2">Créé le</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {signals.map((s) => (
              <tr key={s.id} className="border-t border-slate-200">
                <td className="px-4 py-2 font-mono text-xs">
                  {s.cardId.slice(0, 8)}…
                </td>
                <td className="px-4 py-2">{s.reason}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                    {s.affectedUsers}
                  </span>
                </td>
                <td className="px-4 py-2">{s.totalLapses}</td>
                <td className="px-4 py-2">{s.windowDays} j</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(s.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-2">
                  <a
                    href={`/admin/cards/${s.cardId}`}
                    className="text-emerald-700 hover:underline"
                  >
                    Relire la carte →
                  </a>
                </td>
              </tr>
            ))}
            {signals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Aucun signal {status === 'open' ? 'ouvert' : ''} — lancez un
                  balayage ou revenez après la prochaine exécution planifiée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
