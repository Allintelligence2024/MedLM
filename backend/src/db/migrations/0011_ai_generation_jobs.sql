-- Migration 0011 — ai_generation_jobs (Phase 18.2)
--
-- Audit complet de toute génération assistée par IA :
-- qui (user_id), quoi (kind, prompt_hash, card_ids), quand (created_at),
-- avec quoi (provider, model) et à quel coût (tokens_in/out).
-- Sert aussi au comptage des quotas journaliers (AI_*_DAILY_QUOTA).

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ok',
  provider     TEXT NOT NULL DEFAULT 'mock',
  model        TEXT NOT NULL DEFAULT 'mock-fsm-1',
  prompt_hash  TEXT,
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  card_ids     UUID[] NOT NULL DEFAULT '{}',
  meta         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quota journalier : count(*) WHERE user_id=? AND kind=? AND created_at>=today
CREATE INDEX IF NOT EXISTS ai_jobs_user_kind_idx
  ON ai_generation_jobs (user_id, kind, created_at);

-- Analyse par type (coûts, volume) :
CREATE INDEX IF NOT EXISTS ai_jobs_kind_idx
  ON ai_generation_jobs (kind, created_at);
