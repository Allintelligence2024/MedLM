-- 0017_exam_attempts_active_unique.sql — Phase 12 (rattrapage Phase 10).
--
-- L'unicité « une tentative active par user/template » n'existait que
-- dans le schéma Drizzle (déclaration standalone inopérante — elle
-- crashait au chargement) et n'avait JAMAIS été créée en base.
-- Conséquence : un double start accidentel était possible.
--
-- Index PARTIEL : seules les tentatives en cours comptent. Repasser un
-- sujet déjà soumis reste autorisé.
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_active_unique
  ON exam_attempts (user_id, template_id)
  WHERE status = 'in_progress';
