/// CSRF same-origin pour le proxy CMS (cookie HttpOnly).
///
/// Un cookie SameSite=Lax bloque la plupart des POST cross-site, mais
/// pas un GET forgé ni certains cas de sous-domaines. On exige Origin
/// (ou Referer) = Host pour toute méthode mutante.

export function csrfAllowed(args: {
  origin: string | null;
  referer: string | null;
  host: string;
}): boolean {
  const candidate = args.origin || refererOrigin(args.referer);
  if (!candidate) return false;
  try {
    return new URL(candidate).host === args.host;
  } catch {
    return false;
  }
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
