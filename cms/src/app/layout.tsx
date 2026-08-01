import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MedAnki DZ — CMS éditorial',
  description: 'Workflow draft → review → approved → published',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-6">
            <a href="/" className="font-semibold">MedAnki DZ — CMS</a>
            <a href="/admin/cards" className="text-slate-600 hover:text-slate-900">Cartes</a>
            <a href="/admin/exams" className="text-slate-600 hover:text-slate-900">Examens</a>
            <a href="/admin/users" className="text-slate-600 hover:text-slate-900">Utilisateurs</a>
            <a href="/admin/reports" className="text-slate-600 hover:text-slate-900">Signalements</a>
            <a href="/admin/signals" className="text-slate-600 hover:text-slate-900">Signaux IA</a>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
