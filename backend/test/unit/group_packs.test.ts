// Tests GroupPacksService — Phase 16.3.
// On teste les helpers purs + la logique de pricing.
import { describe, it, expect } from 'vitest';
import { JoinPackBody } from '../../src/group-packs/group-packs.dto';
import { CreatePackBody } from '../../src/group-packs/group-packs.dto';
import { GroupPacksService } from '../../src/group-packs/group-packs.service';

describe('GroupPacksService — _computeSavings', () => {
  // On instancie sans DB (les tests n'appellent pas de méthodes
  // qui touchent la DB).
  const svc = new GroupPacksService({} as any);

  it('plan monthly (350 DA) : per_user = 245 DA, savings = 525 DA', () => {
    const { perUserCents, savingsCents } = svc._computeSavings('monthly');
    // 350 DA * 0.7 = 245 DA = 24500 centimes
    expect(perUserCents).toBe(24500);
    // (35000 - 24500) * 5 = 52500 centimes = 525 DA
    expect(savingsCents).toBe(52500);
  });

  it('plan yearly (2400 DA) : per_user = 1680 DA', () => {
    const { perUserCents, savingsCents } = svc._computeSavings('yearly');
    // 2400 * 0.7 = 1680 DA = 168000 centimes
    expect(perUserCents).toBe(168000);
    // (240000 - 168000) * 5 = 360000 centimes = 3600 DA
    expect(savingsCents).toBe(360000);
  });

  it('plan semester (1500 DA) : per_user = 1050 DA', () => {
    const { perUserCents } = svc._computeSavings('semester');
    expect(perUserCents).toBe(105000);
  });
});

describe('GroupPacksService — _generateInviteCode', () => {
  const svc = new GroupPacksService({} as any);

  it('génère 6 caractères A-Z0-9 (sans 0/O/1/I/L)', () => {
    const code = svc._generateInviteCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('génère des codes différents (probabilité de collision très faible)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(svc._generateInviteCode());
    }
    // 100 codes générés → tous distincts (32^6 ≈ 1 milliard).
    expect(codes.size).toBe(100);
  });
});

describe('CreatePackBody — validation Zod', () => {
  it('accepte un plan valide', () => {
    // Import dynamique.
    const r = CreatePackBody.safeParse({ plan: 'yearly' });
    expect(r.success).toBe(true);
  });

  it('rejette un plan invalide', () => {
    const r = CreatePackBody.safeParse({ plan: 'weekly' });
    expect(r.success).toBe(false);
  });

  it('accepte faculty optionnelle', () => {
    const r = CreatePackBody.safeParse({ plan: 'monthly', faculty: 'Alger' });
    expect(r.success).toBe(true);
  });
});

describe('JoinPackBody — validation Zod', () => {
  it('accepte un code 6 caractères A-Z0-9', () => {
    const r = JoinPackBody.safeParse({ invite_code: 'ABC123' });
    expect(r.success).toBe(true);
  });

  it('rejette un code trop court', () => {
    const r = JoinPackBody.safeParse({ invite_code: 'ABC' });
    expect(r.success).toBe(false);
  });

  it('rejette des caractères spéciaux', () => {
    const r = JoinPackBody.safeParse({ invite_code: 'ABC-12' });
    expect(r.success).toBe(false);
  });
});
