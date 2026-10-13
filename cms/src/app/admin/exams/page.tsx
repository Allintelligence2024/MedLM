// Page d'administration des examens (Phase 11 — squelette).
import { OutOfScopeBanner } from '@/components/admin/out_of_scope';

export default function ExamsAdminPage() {
  return (
    <div className="space-y-6">
      <OutOfScopeBanner feature="L'UI d'administration des examens" />
      <h1 className="text-2xl font-bold">Examens</h1>
      <p className="text-slate-600 max-w-2xl">
        Création de sujets (QCM, 10–60 questions, durée fixe),
        barème standard, suivi des tentatives.
      </p>
      <div className="border border-slate-200 bg-white rounded-lg p-6 text-slate-500">
        <p>
          Des routes d&apos;attempts existent côté API. Cette page ne crée
          pas de sujets et n&apos;est pas un produit examens livré.
        </p>
      </div>
    </div>
  );
}
