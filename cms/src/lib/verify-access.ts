/// Vérifie un access token auprès de Nest. Fail-closed si le backend
/// est injoignable : un cookie posé à la main ne suffit plus.

export function nestBaseUrl(): string {
  return (
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3000'
  );
}

export async function accessTokenAccepted(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(`${nestBaseUrl()}/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Platform': 'cms',
      },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}
