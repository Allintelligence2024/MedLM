-- Migration 0006 — exam templates + anti-cheat log (Phase 10 bis).

-- ── exam_templates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_fr           TEXT NOT NULL,
  name_en           TEXT,
  module_id         UUID REFERENCES modules(id) ON DELETE SET NULL,
  faculty           TEXT,
  study_year        INTEGER,
  total_questions   INTEGER NOT NULL DEFAULT 20,
  duration_minutes  INTEGER NOT NULL DEFAULT 30,
  weights           JSONB NOT NULL DEFAULT '{}'::jsonb,
  pass_threshold    TEXT NOT NULL DEFAULT '0.5',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_templates_module_idx
  ON exam_templates (module_id);
CREATE INDEX IF NOT EXISTS exam_templates_faculty_idx
  ON exam_templates (faculty, study_year);

-- ── exam_attempt_events (append-only) ───────────────────────
CREATE TABLE IF NOT EXISTS exam_attempt_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id   UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_ts    INTEGER NOT NULL,
  server_ts    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_attempt_events_attempt_idx
  ON exam_attempt_events (attempt_id, server_ts);
CREATE INDEX IF NOT EXISTS exam_attempt_events_kind_idx
  ON exam_attempt_events (kind, server_ts);

-- Trigger append-only (refuse UPDATE / DELETE).
CREATE OR REPLACE FUNCTION exam_attempt_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'exam_attempt_events est append-only (kind=%, op=%)',
    TG_OP, current_setting('app.op', true);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS exam_attempt_events_no_update ON exam_attempt_events;
CREATE TRIGGER exam_attempt_events_no_update
  BEFORE UPDATE OR DELETE ON exam_attempt_events
  FOR EACH ROW
  EXECUTE FUNCTION exam_attempt_events_append_only();
