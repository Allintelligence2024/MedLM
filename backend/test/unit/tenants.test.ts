// Tests TenantsService — Phase 16.4.
// On teste les DTOs (validation) et les helpers purs.
import { describe, it, expect } from 'vitest';

describe('CreateTenantBody — validation Zod', () => {
  const { CreateTenantBody } = require('../../src/tenants/tenants.dto');

  it('accepte un body minimal', () => {
    const r = CreateTenantBody.safeParse({
      slug: 'alger-med',
      name: 'Faculté de Médecine d\'Alger',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.country).toBe('DZ');
      expect(r.data.plan).toBe('starter');
    }
  });

  it('rejette un slug invalide (caractères spéciaux)', () => {
    const r = CreateTenantBody.safeParse({
      slug: 'alger_med!',
      name: 'Alger',
    });
    expect(r.success).toBe(false);
  });

  it('rejette un slug trop court', () => {
    const r = CreateTenantBody.safeParse({
      slug: 'a',
      name: 'Alger',
    });
    expect(r.success).toBe(false);
  });

  it('rejette un country != 2 chars', () => {
    const r = CreateTenantBody.safeParse({
      slug: 'alger-med',
      name: 'Alger',
      country: 'ALGER',
    });
    expect(r.success).toBe(false);
  });

  it('rejette un plan invalide', () => {
    const r = CreateTenantBody.safeParse({
      slug: 'alger-med',
      name: 'Alger',
      plan: 'pro',
    });
    expect(r.success).toBe(false);
  });

  it('accepte un branding complet', () => {
    const r = CreateTenantBody.safeParse({
      slug: 'alger-med',
      name: 'Alger',
      branding: {
        logo_url: 'https://example.com/logo.png',
        primary_color: '#1976d2',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejette une primary_color mal formée', () => {
    const r = CreateTenantBody.safeParse({
      slug: 'alger-med',
      name: 'Alger',
      branding: {
        primary_color: 'blue',
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('AddUserBody — validation Zod', () => {
  const { AddUserBody } = require('../../src/tenants/tenants.dto');

  it('accepte student par défaut', () => {
    const r = AddUserBody.safeParse({
      user_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe('student');
  });

  it('rejette un rôle invalide', () => {
    const r = AddUserBody.safeParse({
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'superadmin',
    });
    expect(r.success).toBe(false);
  });

  it('rejette un user_id non-UUID', () => {
    const r = AddUserBody.safeParse({
      user_id: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });
});
