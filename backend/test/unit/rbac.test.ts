// Tests Phase 7 — RBAC.
import { describe, it, expect } from 'vitest';
import { ROLES, Role, PERM, ROLE_PERMISSIONS, roleHas } from '../../src/rbac/roles';

describe('RBAC', () => {
  it('la hiérarchie des rôles est cohérente', () => {
    for (let i = 0; i < ROLES.length - 1; i++) {
      const a = ROLES[i] as Role;
      const b = ROLES[i + 1] as Role;
      const pa = ROLE_PERMISSIONS[a];
      const pb = ROLE_PERMISSIONS[b];
      // Un rôle supérieur doit avoir au moins autant de bits.
      expect(pb & pa).toBe(pa);
    }
  });

  it('admin a toutes les permissions', () => {
    const adminPerms = ROLE_PERMISSIONS.admin;
    for (const p of Object.values(PERM)) {
      expect((adminPerms & p) !== 0).toBe(true);
    }
  });

  it('student n\'a pas CREATE_DRAFT_CARD', () => {
    expect(roleHas('student', PERM.CREATE_DRAFT_CARD)).toBe(false);
  });

  it('author a CREATE_DRAFT_CARD', () => {
    expect(roleHas('author', PERM.CREATE_DRAFT_CARD)).toBe(true);
  });

  it('medical_reviewer a APPROVE_CARD mais pas PUBLISH_CARD', () => {
    expect(roleHas('medical_reviewer', PERM.APPROVE_CARD)).toBe(true);
    expect(roleHas('medical_reviewer', PERM.PUBLISH_CARD)).toBe(false);
  });

  it('editor peut publier mais pas gérer les utilisateurs', () => {
    expect(roleHas('editor', PERM.PUBLISH_CARD)).toBe(true);
    expect(roleHas('editor', PERM.MANAGE_USERS)).toBe(false);
  });
});
