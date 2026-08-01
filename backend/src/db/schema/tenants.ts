// Schéma Drizzle — tenants (Phase 16.4).
//
// Un tenant = une institution (faculté, hôpital, école) qui
// achète MedAnki DZ pour ses étudiants. Le multi-tenancy permet :
//   * Branding personnalisé (logo, couleurs).
//   * Catalogue de decks custom (cartes propres à la faculté).
//   * SSO institutionnel (SAML, OIDC).
//   * Facturation centralisée.
//
// Architecture : un user appartient à UN tenant. Les ressources
// (decks, programmes, modules) peuvent être globales (tenant_id
// = NULL) ou scopées à un tenant (tenant_id = X).
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/// Table des tenants.
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /// Slug unique (utilisé dans les URLs : /t/{slug}).
    slug: text('slug').notNull(),
    /// Nom affichable.
    name: text('name').notNull(),
    /// Pays (ISO 3166-1 alpha-2).
    country: text('country').notNull().default('DZ'),
    /// Ville (utile pour les facultés algériennes).
    city: text('city'),
    /// Configuration branding (logo_url, primary_color, etc.).
    branding: jsonb('branding').notNull().default({}),
    /// SSO config (SAML metadata, OIDC client_id, etc.).
    ssoConfig: jsonb('sso_config').notNull().default({}),
    /// Plan B2B souscrit.
    plan: text('plan').notNull().default('starter'),
    /// Statut (active, suspended, cancelled).
    isActive: boolean('is_active').notNull().default(true),
    /// Date d'expiration du contrat B2B.
    contractEndsAt: timestamp('contract_ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('tenants_slug_unique').on(t.slug),
    isActiveIdx: index('tenants_is_active_idx').on(t.isActive),
  }),
);

/// Lien user ↔ tenant. Un user peut être lié à plusieurs tenants
/// (ex. un prof qui enseigne dans 2 facultés).
export const userTenants = pgTable(
  'user_tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    /// Rôle dans le tenant : 'student', 'instructor', 'admin'.
    role: text('role').notNull().default('student'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTenantUnique: uniqueIndex('user_tenants_user_tenant_unique').on(t.userId, t.tenantId),
    userIdx: index('user_tenants_user_idx').on(t.userId),
    tenantIdx: index('user_tenants_tenant_idx').on(t.tenantId),
  }),
);
