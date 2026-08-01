'use client';

// Page « Établissements » (audit P3-4).
//
// Les endpoints /v1/tenants existaient sans aucune interface : créer un
// établissement ou y rattacher un utilisateur demandait un appel curl.
// Cette page couvre ce que fait réellement une équipe d'administration :
// voir les établissements, en créer un, gérer ses membres.
//
// La création et la gestion des membres exigent le rôle `admin` côté
// serveur (RbacGuard + @RequireRole). Le CMS n'essaie pas de dupliquer
// cette règle : il affiche l'erreur si le serveur refuse.

import { useCallback, useEffect, useState } from 'react';
import { Building2, PlusCircle, UserMinus, UserPlus } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Dialog, Field, describe } from '@/components/admin/ui';

interface TenantMember {
  user_id: string;
  role: string;
  email?: string;
}

interface Tenant {
  id: string;
  name: string;
  slug?: string;
  status?: string;
  seats?: number;
  members?: TenantMember[];
  created_at?: string;
}

export default function TenantsPage() {
  const [items, setItems] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Tenant[] | { tenants: Tenant[] }>('/v1/tenants');
      setItems(Array.isArray(data) ? data : (data.tenants ?? []));
    } catch (e) {
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(tenant: Tenant) {
    try {
      const full = await apiFetch<Tenant>(`/v1/tenants/${tenant.id}`);
      setSelected(full);
    } catch (e) {
      setError(describe(e));
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Building2 className="h-5 w-5 text-slate-500" />
        <h1 className="text-xl font-semibold">Établissements</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
        >
          <PlusCircle className="h-4 w-4" />
          Nouvel établissement
        </button>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun établissement. Les comptes individuels n&apos;en dépendent pas :
          un établissement sert aux facultés et aux groupes institutionnels.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="py-2">Nom</th>
              <th className="py-2">Identifiant</th>
              <th className="py-2">Statut</th>
              <th className="py-2">Sièges</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{t.name}</td>
                <td className="py-2 text-slate-500">{t.slug ?? '—'}</td>
                <td className="py-2">{t.status ?? '—'}</td>
                <td className="py-2">{t.seats ?? '—'}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void openDetail(t)}
                    className="text-slate-600 underline hover:text-slate-900"
                  >
                    Membres
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <CreateTenantDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {selected && (
        <MembersDialog
          tenant={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void openDetail(selected)}
        />
      )}
    </div>
  );
}

function CreateTenantDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/tenants', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() || undefined }),
      });
      onCreated();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Nouvel établissement" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nom" value={name} onChange={setName} required />
        <Field
          label="Identifiant court (slug)"
          value={slug}
          onChange={setSlug}
          placeholder="fac-alger"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm">
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:bg-slate-400"
          >
            {busy ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function MembersDialog({
  tenant,
  onClose,
  onChanged,
}: {
  tenant: Tenant;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/v1/tenants/${tenant.id}/users`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId.trim(), role }),
      });
      setUserId('');
      onChanged();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(memberId: string) {
    setError(null);
    try {
      await apiFetch(`/v1/tenants/${tenant.id}/users/${memberId}`, {
        method: 'DELETE',
      });
      onChanged();
    } catch (e) {
      setError(describe(e));
    }
  }

  return (
    <Dialog title={`Membres — ${tenant.name}`} onClose={onClose}>
      {(tenant.members ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">Aucun membre pour l&apos;instant.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 text-sm">
          {(tenant.members ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 py-2">
              <span className="font-mono text-xs text-slate-500">{m.user_id}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                {m.role}
              </span>
              <button
                type="button"
                onClick={() => void remove(m.user_id)}
                className="ml-auto inline-flex items-center gap-1 text-red-600 hover:underline"
              >
                <UserMinus className="h-4 w-4" />
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 border-t border-slate-200 pt-4">
        <Field
          label="Identifiant utilisateur (UUID)"
          value={userId}
          onChange={setUserId}
          required
        />
        <label className="block text-sm">
          <span className="font-medium">Rôle</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="member">Membre</option>
            <option value="admin">Administrateur</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || userId.trim().length === 0}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:bg-slate-400"
        >
          <UserPlus className="h-4 w-4" />
          {busy ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
    </Dialog>
  );
}
