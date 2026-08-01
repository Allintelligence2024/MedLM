-- Migration 0012 — ai_difficulty_signals (Phase 18.4)
--
-- Signaux remontés aux auteurs quand une carte fait échouer de
-- nombreux utilisateurs de façon répétée ("repeated_lapses") :
-- la difficulté vient peut-être de la carte, pas des étudiants.

CREATE TABLE IF NOT EXISTS ai_difficulty_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  affected_users  INTEGER NOT NULL DEFAULT 0,
  total_lapses    INTEGER NOT NULL DEFAULT 0,
  window_days     INTEGER NOT NULL DEFAULT 30,
  status          TEXT NOT NULL DEFAULT 'open',
  created_by      TEXT NOT NULL DEFAULT 'adaptive-engine',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ai_signals_status_idx
  ON ai_difficulty_signals (status, created_at);

CREATE INDEX IF NOT EXISTS ai_signals_card_idx
  ON ai_difficulty_signals (card_id);

-- Idempotence du scan : au plus UN signal ouvert par carte.
CREATE UNIQUE INDEX IF NOT EXISTS ai_signals_open_card_uniq
  ON ai_difficulty_signals (card_id) WHERE status = 'open';
