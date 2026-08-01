// Tests ShareService — Phase 15.5.
// On teste la logique pure (formatShareText) sans DB.
import { describe, it, expect } from 'vitest';
import { CreateShareBody } from '../../src/share/share.dto';
import { ShareService } from '../../src/share/share.service';

describe('ShareService — formatShareText', () => {
  it('minimal : pseudonyme + pct + module', () => {
    const svc = new ShareService({} as any);
    const out = svc._formatShareText({
      pseudonym: 'alice',
      pct: 82,
      moduleNameFr: 'Anatomie',
      faculty: null,
      style: 'minimal',
    });
    expect(out).toContain('alice');
    expect(out).toContain('82%');
    expect(out).toContain('Anatomie');
    // Pas de faculté en mode minimal.
    expect(out).not.toContain('Faculté');
  });

  it('detailed : ajoute la faculté et un titre soigné', () => {
    const svc = new ShareService({} as any);
    const out = svc._formatShareText({
      pseudonym: 'bob',
      pct: 75,
      moduleNameFr: 'Histologie',
      faculty: 'Faculté Alger',
      style: 'detailed',
    });
    expect(out).toContain('bob');
    expect(out).toContain('Histologie');
    expect(out).toContain('Faculté Alger');
    expect(out).toContain('Mock exam');
  });

  it('story : même format que detailed', () => {
    const svc = new ShareService({} as any);
    const out = svc._formatShareText({
      pseudonym: 'carol',
      pct: 91,
      moduleNameFr: 'Biochimie',
      faculty: 'Faculté Oran',
      style: 'story',
    });
    expect(out).toContain('carol');
    expect(out).toContain('Biochimie');
    expect(out).toContain('Faculté Oran');
  });

  it('toujours inclure un CTA (Call To Action)', () => {
    const svc = new ShareService({} as any);
    const out = svc._formatShareText({
      pseudonym: 'dave',
      pct: 50,
      moduleNameFr: 'Physiologie',
      faculty: null,
      style: 'minimal',
    });
    expect(out).toContain('MedAnki');
  });
});

describe('CreateShareBody — validation Zod', () => {
  it('rejette un body sans attempt_id', () => {
    // Import dynamique pour éviter cycle.
    const r = CreateShareBody.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejette un attempt_id non-UUID', () => {
    const r = CreateShareBody.safeParse({ attempt_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('accepte un body valide avec style par défaut', () => {
    const r = CreateShareBody.safeParse({
      attempt_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.style).toBe('minimal');
  });

  it('rejette un style invalide', () => {
    const r = CreateShareBody.safeParse({
      attempt_id: '00000000-0000-0000-0000-000000000001',
      style: 'banner',
    });
    expect(r.success).toBe(false);
  });
});
