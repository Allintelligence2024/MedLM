export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">MedAnki DZ — CMS éditorial</h1>
      <p className="text-slate-600 max-w-2xl">
        Tranche livrable : cartes publiées via le workflow
        draft → review → approved → published. Session HttpOnly + CSRF.
        Pas de partenariat faculté, pas de multi-tenant, pas de GO production.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href="/admin/cards" className="block border border-slate-200 rounded-lg p-4 hover:border-slate-400">
          <h2 className="font-semibold mb-2">Cartes</h2>
          <p className="text-sm text-slate-600">Lister et éditer les cartes du staff (cookie HttpOnly).</p>
        </a>
        <a href="/admin/workflow" className="block border border-slate-200 rounded-lg p-4 hover:border-slate-400">
          <h2 className="font-semibold mb-2">Workflow</h2>
          <p className="text-sm text-slate-600">Transitions par rôle. Auto-approbation interdite.</p>
        </a>
        <a href="/admin/reports" className="block border border-slate-200 rounded-lg p-4 hover:border-slate-400">
          <h2 className="font-semibold mb-2">Signalements</h2>
          <p className="text-sm text-slate-600">Revue des card_reports par le relecteur.</p>
        </a>
      </div>
    </div>
  );
}
