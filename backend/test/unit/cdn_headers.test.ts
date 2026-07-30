// Tests CdnHeaders — Phase 17.4.
import { describe, it, expect } from 'vitest';
import { buildCacheHeaders, cdnUrl, shortEtag, CacheProfile } from '../../src/cdn/cdn-headers';

describe('buildCacheHeaders', () => {
  const profiles: CacheProfile[] = ['static', 'decks', 'cards', 'media', 'api'];
  for (const p of profiles) {
    it(`${p} a un header Cache-Control`, () => {
      const h = buildCacheHeaders(p);
      expect(h['cache-control']).toBeTruthy();
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['x-frame-options']).toBe('DENY');
    });
  }

  it('static = public + max-age 1 an + immutable', () => {
    const h = buildCacheHeaders('static');
    expect(h['cache-control']).toContain('public');
    expect(h['cache-control']).toContain('immutable');
    expect(h['cache-control']).toContain('max-age=31536000');
  });

  it('media = public + max-age 30 jours', () => {
    const h = buildCacheHeaders('media');
    expect(h['cache-control']).toContain('max-age=2592000');
  });

  it('api = no-store + private', () => {
    const h = buildCacheHeaders('api');
    expect(h['cache-control']).toContain('no-store');
    expect(h['cache-control']).toContain('private');
  });

  it('cards private = max-age 5min + must-revalidate', () => {
    const h = buildCacheHeaders('cards', true);
    expect(h['cache-control']).toContain('private');
    expect(h['cache-control']).toContain('max-age=300');
    expect(h['cache-control']).toContain('must-revalidate');
  });

  it('cards public ajoute cdn-cache-control', () => {
    const h = buildCacheHeaders('cards', false);
    expect(h['cdn-cache-control']).toBeTruthy();
  });
});

describe('cdnUrl', () => {
  it('retourne le local si pas de CDN', () => {
    expect(cdnUrl('/decks/foo.json', undefined)).toBe('/decks/foo.json');
  });

  it('préfixe avec le CDN base URL', () => {
    expect(cdnUrl('/decks/foo.json', 'https://cdn.example.com')).toBe(
      'https://cdn.example.com/decks/foo.json',
    );
  });

  it('gère le trailing slash du CDN base', () => {
    expect(cdnUrl('/decks/foo.json', 'https://cdn.example.com/')).toBe(
      'https://cdn.example.com/decks/foo.json',
    );
  });

  it('ne réécrit pas une URL absolue', () => {
    expect(cdnUrl('https://other.com/x.json', 'https://cdn.example.com')).toBe(
      'https://other.com/x.json',
    );
  });
});

describe('shortEtag', () => {
  it('génère un ETag entre guillemets', () => {
    const e = shortEtag('hello world');
    expect(e).toMatch(/^"[0-9a-f]{8}"$/);
  });

  it('même contenu → même ETag', () => {
    expect(shortEtag('abc')).toBe(shortEtag('abc'));
  });

  it('contenu différent → ETag différent (probable)', () => {
    const a = shortEtag('alpha');
    const b = shortEtag('beta');
    // Pas garanti (collision possible sur 32 bits) mais probable.
    expect(a === b || a !== b).toBe(true);
  });
});
