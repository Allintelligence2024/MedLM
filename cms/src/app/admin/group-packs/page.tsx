'use client';

// Page « Packs de groupe » (audit P3-4).
//
// Les endpoints /v1/group-packs existaient sans interface de gestion.
// Un pack se consulte par son code d'invitation : c'est ce dont le
// support a réellement besoin quand un étudiant écrit « mon code ne
// marche pas ».

import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Field, describe } from '@/components/admin/ui';

interface PackMember {
  user_id: string;
  joined_at?: string;
}

interface GroupPack {
  id: string;
  invite_code: string;
  plan?: string;
  seats?: number;
  seats_used?: number;
  status?: string;
  coordinator_id?: string;
  members?: PackMember[];
  expires_at?: string | null;
}

export default function GroupPacksPage() {
  const [code, setCode] = useState('');
  const [pack, setPack] = useState<GroupPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setPack(null);
    try {
      const data = await apiFetch<GroupPack>(
        `/v1/group-packs?invite_code=${encodeURIComponent(code.trim().toUpperCase())}`,
      );
      setPack(data);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
      setSearched(true);
    }
  }

  const seatsUsed = pack?.seats_used ?? pack?.members?.length ?? 0;
  const seats = pack?.seats ?? 0;

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Users className="h-5 w-5 text-slate-500" />
        <h1 className="text-xl font-semibold">Packs de groupe</h1>
      </header>

      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        Les packs sont créés depuis l&apos;application par un étudiant
        coordinateur. Cette page sert au support : retrouver un pack par son
        code, vérifier les sièges consommés et l&apos;échéance.
      </p>

      <form onSubmit={search} className="mb-6 flex max-w-md items-end gap-2">
        <div className="flex-1">
          <Field
            label="Code d'invitation"
            value={code}
            onChange={setCode}
            placeholder="ABC123"
            required
          />
        </div>
        <button
          type="submit"
          disabled={busy || code.trim().length === 0}
          className="inline-flex h-[42px] items-center gap-1 rounded-md bg-slate-900 px-3 text-sm text-white disabled:bg-slate-400"
        >
          <Search className="h-4 w-4" />
          {busy ? '…' : 'Chercher'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {searched && !pack && !error && (
        <p className="text-sm text-slate-500">Aucun pack pour ce code.</p>
      )}

      {pack && (
        <div className="max-w-2xl rounded-lg border border-slate-200 p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Code" value={pack.invite_code} mono />
            <Row label="Formule" value={pack.plan ?? '—'} />
            <Row label="Statut" value={pack.status ?? '—'} />
            <Row
              label="Sièges"
              value={seats > 0 ? `${seatsUsed} / ${seats}` : `${seatsUsed}`}
            />
            <Row label="Coordinateur" value={pack.coordinator_id ?? '—'} mono />
            <Row
              label="Expire le"
              value={
                pack.expires_at
                  ? new Date(pack.expires_at).toLocaleDateString('fr-DZ')
                  : '—'
              }
            />
          </dl>

          {seats > 0 && seatsUsed >= seats && (
            <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Pack complet : aucun siège disponible. C&apos;est la cause la plus
              fréquente d&apos;un code « qui ne marche pas ».
            </p>
          )}

          <h2 className="mt-6 mb-2 text-sm font-semibold">
            Membres ({pack.members?.length ?? 0})
          </h2>
          {(pack.members ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucun membre.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {(pack.members ?? []).map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 py-2">
                  <span className="font-mono text-xs text-slate-500">
                    {m.user_id}
                  </span>
                  {m.joined_at && (
                    <span className="ml-auto text-xs text-slate-400">
                      {new Date(m.joined_at).toLocaleDateString('fr-DZ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : ''}>{value}</dd>
    </>
  );
}
