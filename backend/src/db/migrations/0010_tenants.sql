-- Migration 0010 — tenants (Phase 16.4).
--
-- Multi-tenancy B2B : une faculté / hôpital / école souscrit
-- un contrat et obtient un tenant_id. Les ressources globales
-- (decks catalogue) restent accessibles à tous, les ressources
-- privées (decks custom de la faculté) sont scopées.

CREATE TABLE IF NOT EXISTS tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  country           TEXT NOT NULL DEFAULT 'DZ',
  city              TEXT,
  branding          JSONB NOT NULL DEFAULT '{}'::jsonb,
  sso_config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan              TEXT NOT NULL DEFAULT 'starter',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  contract_ends_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique
  ON tenants (slug);

CREATE INDEX IF NOT EXISTS tenants_is_active_idx
  ON tenants (is_active);

CREATE TABLE IF NOT EXISTS user_tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'student',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_tenants_user_tenant_unique
  ON user_tenants (user_id, tenant_id);

CREATE INDEX IF NOT EXISTS user_tenants_user_idx
  ON user_tenants (user_id);

CREATE INDEX IF NOT EXISTS user_tenants_tenant_idx
  ON user_tenants (tenant_id);
