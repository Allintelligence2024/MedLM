// CdnHeaders — Phase 17.4.
//
// Helper pour configurer les headers HTTP de cache statique.
// Le CDN (Cloudflare) lit ces headers et applique la politique
// de cache appropriée.
//
// Stratégie de cache par type de contenu (v2 §11.2) :
//   * `static` (JS, CSS, images) : 1 an, immutable, public.
//   * `decks` (catalogue) : 1 heure, public, must-revalidate.
//   * `cards` (contenu) : 5 minutes, private (auth requise).
//   * `media` (R2) : 30 jours, public (signé R2).
//   * `api` (réponses dynamiques) : no-store, private.

export type CacheProfile = 'static' | 'decks' | 'cards' | 'media' | 'api';

export interface CacheHeader {
  'cache-control': string;
  'cdn-cache-control'?: string;
  'x-content-type-options': string;
  'x-frame-options': string;
  vary?: string;
}

const ONE_YEAR = 31_536_000; // secondes
const ONE_HOUR = 3_600;
const FIVE_MINUTES = 300;
const THIRTY_DAYS = ONE_HOUR * 24 * 30;

export function buildCacheHeaders(profile: CacheProfile, isPrivate = false): CacheHeader {
  const base: Omit<CacheHeader, 'cache-control'> = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
  switch (profile) {
    case 'static':
      return {
        ...base,
        'cache-control': `public, max-age=${ONE_YEAR}, immutable`,
        'cdn-cache-control': `public, max-age=${ONE_YEAR}`,
      };
    case 'decks':
      return {
        ...base,
        'cache-control': isPrivate
          ? `private, max-age=${ONE_HOUR}, must-revalidate`
          : `public, max-age=${ONE_HOUR}, must-revalidate`,
        'cdn-cache-control': `public, max-age=${ONE_HOUR}`,
        vary: 'Accept-Encoding',
      };
    case 'cards':
      return {
        ...base,
        'cache-control': isPrivate
          ? `private, max-age=${FIVE_MINUTES}, must-revalidate`
          : `public, max-age=${FIVE_MINUTES}, must-revalidate`,
        'cdn-cache-control': `public, max-age=${FIVE_MINUTES}`,
        vary: 'Authorization, Accept-Encoding',
      };
    case 'media':
      return {
        ...base,
        'cache-control': `public, max-age=${THIRTY_DAYS}, immutable`,
        'cdn-cache-control': `public, max-age=${THIRTY_DAYS}`,
      };
    case 'api':
      return {
        ...base,
        'cache-control': 'no-store, no-cache, must-revalidate, private',
      };
  }
}

/// Réécrit une URL locale en URL CDN. Le CDN sert le contenu
/// statique (decks, media) sans passer par l'app.
export function cdnUrl(localUrl: string, cdnBaseUrl: string | undefined): string {
  if (!cdnBaseUrl) return localUrl;
  if (localUrl.startsWith('http://') || localUrl.startsWith('https://')) {
    return localUrl;
  }
  // Chemin relatif → on préfixe par le CDN.
  const path = localUrl.startsWith('/') ? localUrl : `/${localUrl}`;
  return `${cdnBaseUrl.replace(/\/$/, '')}${path}`;
}

/// Helper pour les ETags (hash court du contenu).
export function shortEtag(content: string | Buffer): string {
  // En prod : utiliser crypto.createHash('sha256').digest('hex').slice(0, 16)
  // Ici on retourne un placeholder déterministe.
  const s = typeof content === 'string' ? content : content.toString('utf8');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `"${Math.abs(h).toString(16).padStart(8, '0')}"`;
}
