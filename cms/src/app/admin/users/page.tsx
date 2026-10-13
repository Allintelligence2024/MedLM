// Page d'administration des utilisateurs (Phase 11 — squelette).
//
// Affiche le rôle RBAC et le statut d'entitlement. Pas encore
// d'édition (Phase 11 bis : suspendre, rembourser, changer rôle).
export default function UsersAdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Utilisateurs</h1>
      <p className="text-slate-600">
        Liste et édition des comptes : non livrées. L&apos;auth admin est
        magic-link + TOTP, pas un SSO.
      </p>
      <div className="border border-slate-200 bg-white rounded-lg p-6 text-slate-500">
        <p>
          Les tables <code>users</code>, <code>entitlements</code>,{' '}
          <code>audit_log</code> existent. Cette page ne les affiche pas encore.
        </p>
      </div>
    </div>
  );
}
