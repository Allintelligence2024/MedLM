'use client';

// Composants d'administration partagés.
//
// Ils vivaient dans `admin/tenants/page.tsx`, mais Next.js interdit à un
// fichier `page.tsx` d'exporter autre chose que la page (et ses options
// de route) : le build échouait sur « "Dialog" is not a valid Page
// export field ». Les sortir ici les rend aussi réutilisables par les
// autres écrans d'administration.

import { ApiError } from '@/lib/api';

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-slate-400 hover:text-slate-700"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

export function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Votre rôle ne permet pas cette action.";
    if (error.status === 404) return 'Introuvable.';
    return `Erreur serveur (${error.status}).`;
  }
  return 'Serveur injoignable.';
}
