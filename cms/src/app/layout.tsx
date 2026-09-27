import './globals.css';
import type { Metadata } from 'next';
import { SessionMenu } from '@/components/nav/session_menu';

export const metadata: Metadata = {
  title: 'MedAnki DZ — CMS éditorial',
  description: 'Workflow draft → review → approved → published',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-6 flex-wrap">
            <a href="/" className="font-semibold">MedAnki DZ — CMS</a>
            <a href="/admin/cards" className="text-slate-600 hover:text-slate-900">Cartes</a>
            <a href="/admin/workflow" className="text-slate-600 hover:text-slate-900">Workflow</a>
            <a href="/admin/reports" className="text-slate-600 hover:text-slate-900">Signalements</a>
            <a href="/admin/users" className="text-slate-600 hover:text-slate-900">Utilisateurs</a>
            <details className="relative">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-900 list-none">
                Hors MVP
              </summary>
              <div className="absolute z-20 mt-2 bg-white border border-slate-200 rounded-md shadow-sm py-1 min-w-48">
                <a href="/admin/exams" className="block px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Examens</a>
                <a href="/admin/signals" className="block px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Signaux IA</a>
                <a href="/admin/partnerships" className="block px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Partenariats</a>
                <a href="/admin/tenants" className="block px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Établissements</a>
                <a href="/admin/group-packs" className="block px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Packs groupe</a>
              </div>
            </details>
            <SessionMenu />
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
