// Tests Phase 20.4 — machine à états des partenariats + allow-list.
import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  assertActivable,
  PARTNERSHIP_STATUSES,
} from '../../src/partnerships/partnership-status';
import { FACULTIES_DZ, isKnownFaculty } from '../../src/partnerships/faculties';
import { PartnershipCreateBody } from '../../src/partnerships/partnerships.dto';

describe('machine à états partenariat', () => {
  it('transitions autorisées', () => {
    expect(canTransition('draft', 'active')).toBe(true);
    expect(canTransition('draft', 'terminated')).toBe(true);
    expect(canTransition('active', 'suspended')).toBe(true);
    expect(canTransition('suspended', 'active')).toBe(true);
    expect(canTransition('active', 'terminated')).toBe(true);
    expect(canTransition('suspended', 'terminated')).toBe(true);
  });

  it('transitions interdites (terminated est puit, pas de retour en draft)', () => {
    expect(canTransition('terminated', 'active')).toBe(false);
    expect(canTransition('terminated', 'draft')).toBe(false);
    expect(canTransition('active', 'draft')).toBe(false);
    expect(canTransition('suspended', 'draft')).toBe(false);
    expect(canTransition('draft', 'suspended')).toBe(false);
    expect(() => assertTransition('terminated', 'active')).toThrow(
      /transition partenariat interdite/,
    );
  });

  it('tous les statuts ont une ligne de transition déclarée', () => {
    for (const s of PARTNERSHIP_STATUSES) {
      expect(
        ['draft', 'active', 'suspended', 'terminated'].includes(s),
      ).toBe(true);
    }
  });

  it('activation : signature obligatoire (draft) + commission bornée', () => {
    expect(() =>
      assertActivable({ from: 'draft', signedAt: null, commissionPct: 10 }),
    ).toThrow(/signature/);
    expect(() =>
      assertActivable({ from: 'draft', signedAt: new Date(), commissionPct: 51 }),
    ).toThrow(/commission/);
    expect(() =>
      assertActivable({ from: 'draft', signedAt: new Date(), commissionPct: 15 }),
    ).not.toThrow();
    // reprise après suspension : pas besoin de re-signature.
    expect(() =>
      assertActivable({ from: 'suspended', signedAt: null, commissionPct: 15 }),
    ).not.toThrow();
  });
});

describe('allow-list facultés DZ', () => {
  it('couvre les grandes villes universitaires médicales', () => {
    for (const f of ['Alger', 'Oran', 'Constantine']) {
      expect(FACULTIES_DZ).toContain(f);
    }
    expect(FACULTIES_DZ.length).toBeGreaterThanOrEqual(8);
  });

  it('isKnownFaculty insensible à la casse et aux espaces', () => {
    expect(isKnownFaculty('oran')).toBe(true);
    expect(isKnownFaculty('  SETIF ')).toBe(true);
    expect(isKnownFaculty('Paris 13')).toBe(false);
  });
});

describe('PartnershipCreateBody', () => {
  it('accepte un brouillon nominal', () => {
    const parsed = PartnershipCreateBody.parse({
      faculty: 'Oran',
      contact_email: 'contact@med-oran.dz',
      scope: ['anatomie'],
      commission_pct: 12,
    });
    expect(parsed.faculty).toBe('Oran');
    expect(parsed.commission_pct).toBe(12);
  });

  it('rejette une faculté hors allow-list', () => {
    expect(() =>
      PartnershipCreateBody.parse({
        faculty: 'Paris 13',
        contact_email: 'x@y.dz',
      }),
    ).toThrow();
  });

  it('rejette commission > 50 et email invalide', () => {
    expect(() =>
      PartnershipCreateBody.parse({
        faculty: 'Alger',
        contact_email: 'x@y.dz',
        commission_pct: 51,
      }),
    ).toThrow();
    expect(() =>
      PartnershipCreateBody.parse({
        faculty: 'Alger',
        contact_email: 'pas-un-email',
      }),
    ).toThrow();
  });
});
