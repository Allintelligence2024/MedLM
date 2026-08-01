'use client';

// Indicateur de session + déconnexion (audit P2-7).
//
// Sans page de login, il n'y avait pas non plus de déconnexion : la
// seule façon de « sortir » était de vider le localStorage à la main.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getRole, isAuthenticated, LOGIN_PATH } from '@/lib/auth';

export function SessionMenu() {
  const router = useRouter();
  // Le rendu serveur ne connaît pas les cookies du navigateur : on
  // attend le montage pour éviter une divergence d'hydratation.
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
