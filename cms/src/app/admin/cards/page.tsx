// Page d'administration des cartes.
//
// Phase 11 : on liste les cartes du backend. L'édition / création
// sera branchée en Phase 11 bis.
import { apiFetch, type CardSummary } from '@/lib/api';

export default async function CardsAdminPage() {
  // Note : on appelle le backend. Si l'auth échoue, on affiche un
  // message clair (le CMS ne hardcode pas de token).
  let cards: CardSummary[] = [];
  let error: string | null = null;
  try {
    const res = await apiFetch<{ items: CardSummary[] }>('/v1/content/cards/list?limit=50');
    cards = res.items;
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cartes</h1>
          <p className="text-slate-600">{cards.length} carte(s) — deck par deck, module par module.</p>
        </div>
        <button className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700" disabled>
          Nouvelle carte (Phase 11 bis)
        </button>
      </header>

      {error ? (
        <div className="border border-amber-200 bg-amber-50 text-amber-900 p-4 rounded-md">
          <p className="font-medium">Impossible de joindre le backend</p>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs mt-2 text-amber-700">
            Vérifier NEXT_PUBLIC_API_BASE_URL et que le backend NestJS tourne.
          </p>
        </div>
      ) : (
        <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
          <thead className="bg-slate-100 text-left text-sm">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Deck</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Version</th>
              <th className="px-4 py-2">Premium</th>
              <th className="px-4 py-2">MAJ</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {cards.map((c) => (
              <tr key={c.id} className="border-t border-slate-200">
                <td className="px-4 py-2 font-mono text-xs">{c.id.slice(0, 8)}…</td>
                <td className="px-4 py-2 font-mono text-xs">{c.deck_id.slice(0, 8)}…</td>
                <td className="px-4 py-2">{c.type}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(c.status)}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2">v{c.version}</td>
                <td className="px-4 py-2">{c.is_premium ? 'oui' : 'non'}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(c.updated_at).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
            {cards.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Aucune carte — lance une migration Drizzle puis seed le contenu de départ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'published': return 'bg-emerald-100 text-emerald-800';
    case 'approved': return 'bg-blue-100 text-blue-800';
    case 'review': return 'bg-amber-100 text-amber-800';
    case 'draft': return 'bg-slate-200 text-slate-700';
    case 'retired': return 'bg-red-100 text-red-800';
    default: return 'bg-slate-100 text-slate-600';
  }
}
