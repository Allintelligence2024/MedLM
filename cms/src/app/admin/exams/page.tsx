// Page d'administration des examens (Phase 11 — squelette).
export default function ExamsAdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Examens</h1>
      <p className="text-slate-600 max-w-2xl">
        Création de sujets (QCM, 10–60 questions, durée fixe),
        barème standard, suivi des tentatives.
      </p>
      <div className="border border-slate-200 bg-white rounded-lg p-6 text-slate-500">
        <p>Module Phase 11 bis — le backend expose déjà <code>POST /v1/exams/attempts</code> et <code>POST /v1/exams/attempts/:id/submit</code> ; il manque l'UI pour créer les sujets et leurs questions.</p>
      </div>
    </div>
  );
}
