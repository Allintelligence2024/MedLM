/// RBAC — rôles et permissions (architecture v2 §8.2).
///
/// Cinq rôles sont prévus par le doc :
///   * student         — utilise l'app, lit les cartes publiées, signale
///   * author          — + crée/édite des cartes en DRAFT
///   * medical_reviewer — + relit, approuve ou rejette les cartes
///   * editor          — + publie, retire, gère les decks
///   * admin           — full access (user management, billing, audit)
///
/// On code les permissions comme des bits dans un entier (Number) pour
/// permettre un check rapide (`(user.permissions & PERM_X) !== 0`) et
/// un stockage compact (1 colonne BIGINT).
///
/// IMPORTANT : un rôle **étend** les permissions du rôle précédent. La
/// hiérarchie est : student < author < medical_reviewer < editor < admin.
/// C'est une simplification commode : on n'a pas besoin de gérer une
/// matrice user×permission dans le code applicatif.
///
/// Côté CMS (Phase 11), on stockera dans la table `users` une colonne
/// `rbac_role` de type text parmi ces valeurs. En attendant, on peut
/// bootstrapper l'admin via une variable d'environnement.
export const ROLES = ['student', 'author', 'medical_reviewer', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/// Permissions disponibles dans le système.
export const PERM = {
  // student (toute personne connectée)
  READ_PUBLISHED_CARDS: 1 << 0,
  REPORT_CARD: 1 << 1,
  USE_APP: 1 << 2,

  // author
  CREATE_DRAFT_CARD: 1 << 3,
  EDIT_OWN_DRAFT: 1 << 4,

  // medical_reviewer
  REVIEW_CARD: 1 << 5,
  APPROVE_CARD: 1 << 6,
  REJECT_CARD: 1 << 7,

  // editor
  PUBLISH_CARD: 1 << 8,
  RETIRE_CARD: 1 << 9,
  MANAGE_DECKS: 1 << 10,
  TOGGLE_TAKEDOWN: 1 << 11,

  // admin
  MANAGE_USERS: 1 << 12,
  MANAGE_BILLING: 1 << 13,
  VIEW_AUDIT_LOG: 1 << 14,
  IMPERSONATE_USER: 1 << 15,
} as const;

const studentPerms = PERM.READ_PUBLISHED_CARDS | PERM.REPORT_CARD | PERM.USE_APP;
const authorPerms = studentPerms | PERM.CREATE_DRAFT_CARD | PERM.EDIT_OWN_DRAFT;
const reviewerPerms = authorPerms | PERM.REVIEW_CARD | PERM.APPROVE_CARD | PERM.REJECT_CARD;
const editorPerms = reviewerPerms | PERM.PUBLISH_CARD | PERM.RETIRE_CARD | PERM.MANAGE_DECKS | PERM.TOGGLE_TAKEDOWN;
const adminPerms = editorPerms | PERM.MANAGE_USERS | PERM.MANAGE_BILLING | PERM.VIEW_AUDIT_LOG | PERM.IMPERSONATE_USER;

/// Mapping rôle → permissions cumulées.
export const ROLE_PERMISSIONS: Record<Role, number> = {
  student: studentPerms,
  author: authorPerms,
  medical_reviewer: reviewerPerms,
  editor: editorPerms,
  admin: adminPerms,
};

/// Check rapide : un rôle a-t-il la permission demandée ?
export function roleHas(role: Role, perm: number): boolean {
  return (ROLE_PERMISSIONS[role] & perm) !== 0;
}

/// Liste de toutes les permissions d'un rôle — pour l'UI admin.
export function permissionsForRole(role: Role): string[] {
  return Object.entries(PERM)
    .filter(([, v]) => roleHas(role, v as number))
    .map(([k]) => k);
}
