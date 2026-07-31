-- Migration 0015 — ai_tutor_prompts (Phase 18.6, APPEND-ONLY)
--
-- Audit complet des échanges du tuteur vocal : question, réponse servie
-- (avec disclaimer inclus — preuve de conformité), provider/modèle,
-- tokens, drapeaux emergency/within_scope.
--
-- Comme review_logs, cette table est INALTÉRABLE : un audit ne se
-- réécrit pas. Triggers no_update / no_delete (pattern migration 0002,
-- idempotent CREATE OR REPLACE + DROP IF EXISTS).

CREATE TABLE IF NOT EXISTS ai_tutor_prompts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'fr',
  provider      TEXT NOT NULL DEFAULT 'mock',
  model         TEXT NOT NULL DEFAULT 'mock-fsm-1',
  answer        TEXT NOT NULL,
  response_hash TEXT NOT NULL,
  within_scope  BOOLEAN NOT NULL DEFAULT true,
  emergency     BOOLEAN NOT NULL DEFAULT false,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_tutor_prompts_user_idx
  ON ai_tutor_prompts (user_id, created_at);

CREATE INDEX IF NOT EXISTS ai_tutor_prompts_scope_idx
  ON ai_tutor_prompts (within_scope, created_at);

-- ── Triggers append-only ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ai_tutor_prompts_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_tutor_prompts est append-only : UPDATE interdit';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_tutor_prompts_no_update ON ai_tutor_prompts;
CREATE TRIGGER ai_tutor_prompts_no_update
  BEFORE UPDATE ON ai_tutor_prompts
  FOR EACH ROW
  EXECUTE FUNCTION ai_tutor_prompts_no_update();

CREATE OR REPLACE FUNCTION ai_tutor_prompts_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_tutor_prompts est append-only : DELETE interdit';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_tutor_prompts_no_delete ON ai_tutor_prompts;
CREATE TRIGGER ai_tutor_prompts_no_delete
  BEFORE DELETE ON ai_tutor_prompts
  FOR EACH ROW
  EXECUTE FUNCTION ai_tutor_prompts_no_delete();
