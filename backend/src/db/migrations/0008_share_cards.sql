-- Migration 0008 — share_cards (Phase 15.5).
--
-- Une ligne par carte de partage générée. Conformité RGPD :
-- pas d'email, pas d'IP, pas d'user_agent. Snapshot minimal
-- (pseudonyme, score, module) pour rendre l'image reproductible.

CREATE TABLE IF NOT EXISTS share_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id    UUID NOT NULL,
  pseudonym     TEXT NOT NULL,
  score         REAL NOT NULL,
  pct           INTEGER NOT NULL,
  module_name_fr TEXT NOT NULL,
  faculty       TEXT,
  style         TEXT NOT NULL DEFAULT 'minimal',
  image_url     TEXT,
  share_text    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS share_cards_user_idx
  ON share_cards (user_id, created_at);

CREATE INDEX IF NOT EXISTS share_cards_expires_idx
  ON share_cards (expires_at);
