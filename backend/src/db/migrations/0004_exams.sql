-- MedAnki DZ — migration Phase 10 : Examens.
--
-- Ajoute :
--   * exam_attempts        — tentatives d'examen par utilisateur
--   * exam_questions       — questions QCM d'un sujet
--   * exam_answers         — réponses par tentative
--   * cards.exam_question_id — lien carte ↔ question d'examen
--                              (permet la réinjection SRS automatique)
--
-- Idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS exam_attempts (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id         uuid NOT NULL,
  started_at          timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  submitted_at        timestamptz,
  status              text NOT NULL DEFAULT 'in_progress',
  score               real,
  correct_count       integer,
  incorrect_count     integer,
  unanswered_count    integer
);
CREATE INDEX IF NOT EXISTS exam_attempts_user_idx ON exam_attempts (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS exam_attempts_template_idx ON exam_attempts (template_id);

CREATE TABLE IF NOT EXISTS exam_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL,
  card_id       uuid REFERENCES cards(id) ON DELETE SET NULL,
  position      integer NOT NULL,
  options       jsonb NOT NULL,
  is_multiple   boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS exam_questions_template_idx ON exam_questions (template_id, position);

CREATE TABLE IF NOT EXISTS exam_answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  selected      jsonb NOT NULL,
  duration_ms   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_answers_attempt_idx ON exam_answers (attempt_id, question_id);

-- Lien carte ↔ question d'examen.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS exam_question_id uuid;
