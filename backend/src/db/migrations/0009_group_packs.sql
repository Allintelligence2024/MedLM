-- Migration 0009 — group_packs (Phase 16.3).
--
-- Pack groupe : 1 coordinateur + 4 invités = 5 étudiants qui
-- achètent ensemble avec -30% sur le prix de base.

CREATE TABLE IF NOT EXISTS group_packs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan              TEXT NOT NULL,
  faculty          TEXT,
  invite_code       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  per_user_cents    INTEGER NOT NULL,
  payment_ref      TEXT,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS group_packs_invite_code_idx
  ON group_packs (invite_code);

CREATE INDEX IF NOT EXISTS group_packs_coordinator_idx
  ON group_packs (coordinator_user_id, created_at);

CREATE INDEX IF NOT EXISTS group_packs_status_idx
  ON group_packs (status, expires_at);

CREATE TABLE IF NOT EXISTS group_pack_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id         UUID NOT NULL REFERENCES group_packs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_coordinator  TEXT NOT NULL DEFAULT 'false',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS group_pack_members_pack_user_idx
  ON group_pack_members (pack_id, user_id);

CREATE INDEX IF NOT EXISTS group_pack_members_user_idx
  ON group_pack_members (user_id);
