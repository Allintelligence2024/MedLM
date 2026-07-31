-- Migration 0014 — retention_alerts (Phase 18.5)
--
-- Historique des alertes de décrochage réellement envoyées.
-- Sert à la déduplication anti-spam : pas de renvoi du même niveau
-- pendant 7 jours (escalade possible après 3 jours).

CREATE TABLE IF NOT EXISTS retention_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level        TEXT NOT NULL,
  channels     INTEGER NOT NULL DEFAULT 0,
  notified_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retention_alerts_user_idx
  ON retention_alerts (user_id, notified_at);

CREATE INDEX IF NOT EXISTS retention_alerts_level_idx
  ON retention_alerts (level, notified_at);
