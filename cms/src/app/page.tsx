export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">MedAnki DZ — CMS éditorial</h1>
      <p className="text-slate-600 max-w-2xl">
        Workflow draft → review → approved → published. RBAC à 5 rôles
        (student / author / medical_reviewer / editor / admin). Authentification
        via le même backend que l'app mobile (JWT RS256, magic link, OAuth2).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href="/admin/cards" className="block border border-slate-200 rounded-lg p-4 hover:border-slate-400">
          <h2 className="font-semibold mb-2">Cartes</h2>
          <p className="text-sm text-slate-600">Lister, créer, éditer, approuver les cartes (par deck/module).</p>
        </a>
        <a href="/admin/exams" className="block border border-slate-200 rounded-lg p-4 hover:border-slate-400">
          <h2 className="font-semibold mb-2">Examens</h2>
          <p className="text-sm text-slate-600">Créer des sujets, définir le barème, suivre les tentatives.</p>
        </a>
        <a href="/admin/users" className="block border border-slate-200 rounded-lg p-4 hover:border-slate-400">
          <h2 className="font-semibold mb-2">Utilisateurs</h2>
          <p className="text-sm text-slate-600">RBAC, suspensions, remboursements, audit log.</p>
        </a>
      </div>
    </div>
  );
}
