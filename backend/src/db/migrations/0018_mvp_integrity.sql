-- ────────────────────────────────────────────────────────────────────────────
-- MedAnki DZ — migration 0018 : intégrité MVP PostgreSQL
--
-- Cette migration complète les contraintes absentes des migrations
-- précédentes, sans toucher aux migrations déjà appliquées :
--   * clés étrangères manquantes ;
--   * contraintes CHECK de domaine ;
--   * unicités implicites du métier MVP.
--
-- Elle échoue explicitement si des données historiques violent une
-- nouvelle contrainte, plutôt que de les masquer silencieusement.
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Clés étrangères manquantes ─────────────────────────────────────────
-- 0001_init.sql ne référençait pas les FK sur programme/module/deck/card
-- dans le SQL (elles n'existaient que dans le schéma Drizzle). On les crée
-- ici, après coup, en mode strict.

ALTER TABLE modules
  ADD CONSTRAINT modules_programme_id_fkey
  FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE CASCADE;

ALTER TABLE decks
  ADD CONSTRAINT decks_module_id_fkey
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE;

ALTER TABLE cards
  ADD CONSTRAINT cards_deck_id_fkey
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE;

ALTER TABLE card_versions
  ADD CONSTRAINT card_versions_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;

-- study_sessions.deck_id référençait cards.deck_id dans Drizzle (colonne
-- non unique, donc impossible en PostgreSQL). On corrige vers decks.id.
ALTER TABLE study_sessions
  ADD CONSTRAINT study_sessions_deck_id_fkey
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL;

-- ── 2. Contraintes CHECK de domaine ───────────────────────────────────────

-- Années d'étude 1..6 (standard DZ).
ALTER TABLE programmes
  ADD CONSTRAINT programmes_study_year_check
  CHECK (study_year >= 1 AND study_year <= 6);

-- modules.order_index ne peut pas être négatif.
ALTER TABLE modules
  ADD CONSTRAINT modules_order_index_check
  CHECK (order_index >= 0);

-- decks.version > 0.
ALTER TABLE decks
  ADD CONSTRAINT decks_version_check
  CHECK (version > 0);

-- cards.version > 0.
ALTER TABLE cards
  ADD CONSTRAINT cards_version_check
  CHECK (version > 0);

-- Statuts valides pour cards.
ALTER TABLE cards
  ADD CONSTRAINT cards_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

-- Types valides pour cards.
ALTER TABLE cards
  ADD CONSTRAINT cards_type_check
  CHECK (type IN ('basic', 'cloze', 'image', 'audio'));

-- rating ∈ {1, 2, 3, 4}.
ALTER TABLE review_logs
  ADD CONSTRAINT review_logs_rating_check
  CHECK (rating >= 1 AND rating <= 4);

-- États SRS valides.
ALTER TABLE srs_card_state
  ADD CONSTRAINT srs_card_state_state_check
  CHECK (state IN ('new', 'learning', 'review', 'relearning', 'buried'));

-- Plans d'entitlement valides.
ALTER TABLE entitlements
  ADD CONSTRAINT entitlements_plan_check
  CHECK (plan IN ('free', 'premium'));

-- Rôles RBAC valides.
ALTER TABLE users
  ADD CONSTRAINT users_rbac_role_check
  CHECK (rbac_role IN ('student', 'author', 'admin', 'super_admin'));

-- ── 3. Contraintes métier MVP ─────────────────────────────────────────────
-- Un seul entitlement premium actif par utilisateur.
--
-- NOTE : l'unicité (user_id, plan) existe déjà via l'index
-- `entitlements_user_plan_idx` créé par 0001_init.sql. Un index partiel
-- avec `now()` serait rejeté par PostgreSQL (now() n'est pas IMMUTABLE).
-- On s'appuie donc sur la contrainte existante.

-- ── 4. Vérification pgcrypto ──────────────────────────────────────────────
-- gen_random_uuid() est utilisé dans 0001_init.sql sans CREATE EXTENSION
-- explicite. On s'assure que l'extension est présente.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
