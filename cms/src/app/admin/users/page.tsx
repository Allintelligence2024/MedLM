// Page d'administration des utilisateurs (Phase 11 — squelette).
//
// Affiche le rôle RBAC et le statut d'entitlement. Pas encore
// d'édition (Phase 11 bis : suspendre, rembourser, changer rôle).
export default function UsersAdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Utilisateurs</h1>
      <p className="text-slate-600">RBAC + entitlements — opérations Phase 11 bis.</p>
      <div className="border border-slate-200 bg-white rounded-lg p-6 text-slate-500">
        <p>Le backend expose <code>users</code>, <code>entitlements</code>, <code>audit_log</code>. L'UI viendra quand le SSO admin sera branché.</p>
      </div>
    </div>
  );
}
