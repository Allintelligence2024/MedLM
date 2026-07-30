-- ────────────────────────────────────────────────────────────────────────────
-- MedAnki DZ — triggers append-only sur le journal des revues
--
-- Pourquoi cette migration manuelle ?
-- Drizzle-kit ne sait pas générer de triggers PostgreSQL. Or la protection
-- de `review_logs` est non négociable (doc v2 §14) : on ne peut pas laisser
-- un bug applicatif supprimer ou modifier une revue.
--
-- Cette migration est idempotente : `CREATE OR REPLACE` + `DROP IF EXISTS`.
-- Elle peut être ré-exécutée sans risque.
-- ────────────────────────────────────────────────────────────────────────────

-- Interdit UPDATE sur les colonnes de contenu du journal.
-- Seul `received_at` peut théoriquement être ajusté (correction d'horloge
-- serveur) — pour l'instant, on l'interdit aussi, par sécurité.
CREATE OR REPLACE FUNCTION review_logs_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'review_logs est append-only : UPDATE interdit';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_logs_no_update ON review_logs;
CREATE TRIGGER review_logs_no_update
  BEFORE UPDATE ON review_logs
  FOR EACH ROW
  EXECUTE FUNCTION review_logs_no_update();

-- Interdit DELETE, sans exception.
CREATE OR REPLACE FUNCTION review_logs_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'review_logs est append-only : DELETE interdit';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_logs_no_delete ON review_logs;
CREATE TRIGGER review_logs_no_delete
  BEFORE DELETE ON review_logs
  FOR EACH ROW
  EXECUTE FUNCTION review_logs_no_delete();

-- Garde-fou symétrique côté `srs_card_state` : un UPDATE ne peut pas
-- *baisser* `reps` ni `lapses`. Ça n'empêche pas la corruption (un
-- attaquant peut SET reps = reps + 1000), mais ça détecte les régressions
-- applicatives pendant le développement.
CREATE OR REPLACE FUNCTION srs_state_no_decrement() RETURNS trigger AS $$
BEGIN
  IF NEW.reps < OLD.reps THEN
    RAISE EXCEPTION 'srs_card_state.reps ne peut pas décroître (%, %)', OLD.reps, NEW.reps;
  END IF;
  IF NEW.lapses < OLD.lapses THEN
    RAISE EXCEPTION 'srs_card_state.lapses ne peut pas décroître (%, %)', OLD.lapses, NEW.lapses;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS srs_state_no_decrement ON srs_card_state;
CREATE TRIGGER srs_state_no_decrement
  BEFORE UPDATE ON srs_card_state
  FOR EACH ROW
  EXECUTE FUNCTION srs_state_no_decrement();
