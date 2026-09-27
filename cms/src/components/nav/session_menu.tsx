'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getRole, isAuthenticated, LOGIN_PATH } from '@/lib/auth';

export function SessionMenu() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setRole(getRole());
  }, []);

  if (!mounted || !isAuthenticated()) return null;

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      {role && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
          {role}
        </span>
      )}
      {role === 'admin' && (
        <a href="/admin/security" className="text-slate-600 hover:text-slate-900">
          Sécurité
        </a>
      )}
      <button
        type="button"
        onClick={() => {
          clearSession();
          router.replace(LOGIN_PATH);
        }}
        className="text-slate-600 hover:text-slate-900"
      >
        Déconnexion
      </button>
    </div>
  );
}
