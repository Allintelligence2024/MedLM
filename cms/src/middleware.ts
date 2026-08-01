// Middleware Next — protège /admin/* (audit P2-7).
//
// S'exécute côté serveur AVANT le rendu : une page d'administration
// n'est jamais servie à quelqu'un sans session, même le temps d'un
// flash. C'est ce qui manquait pour pouvoir exposer le CMS hors du
// réseau interne.
//
// Le middleware ne VALIDE pas le jeton (il ne connaît pas la clé
// publique RS256 du backend) : il vérifie sa présence. La validation
// reste faite par le backend, qui répond 401 — traité côté client par
// `handleUnauthorized`.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'cms_token';
const LOGIN_PATH = '/admin/login';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // La page de login doit rester atteignable, sinon plus personne
  // ne peut se connecter.
  if (pathname === LOGIN_PATH) {
    // Déjà connecté ? On évite de redemander un mot de passe.
    if (request.cookies.get(AUTH_COOKIE)?.value) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/cards';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?from=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Tout /admin/*, hors ressources statiques.
  matcher: ['/admin/:path*'],
};
