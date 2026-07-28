-- MedAnki DZ — schéma local v1 (SQLite / Drift)
--
-- Principes (architecture v2, §3) :
--   * `review_log` est un journal APPEND-ONLY : c'est la source de vérité de la
--     progression. `srs_state` n'en est qu'une projection recalculable.
--   * Tout est porté par `user_id` : plusieurs comptes peuvent cohabiter sur un
--     même appareil, et la suppression d'un compte n'efface que ses données.
--   * `outbox_events` découple l'écriture locale de la synchronisation : une
--     revue est durablement enregistrée avant toute tentative réseau.
--
-- Les migrations sont réelles et testées (voir tools/test_migrations.py) :
--   aucune destruction de données entre deux versions.

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTENU (miroir local du contenu serveur, versionné par deck)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE deck_meta (
  deck_id            TEXT    NOT NULL PRIMARY KEY,
  module_id          TEXT    NOT NULL,
  name_fr            TEXT    NOT NULL,
  name_en            TEXT    NOT NULL DEFAULT '',
  description_fr     TEXT    NOT NULL DEFAULT '',
  -- Version du deck côté serveur : sert au pull delta (`version > cursor`).
  version            INTEGER NOT NULL DEFAULT 1,
  card_count         INTEGER NOT NULL DEFAULT 0,
  is_premium         INTEGER NOT NULL DEFAULT 1 CHECK (is_premium IN (0, 1)),
  -- Faux tant que le téléchargement complet (cartes + médias) n'est pas fini.
  is_offline_ready   INTEGER NOT NULL DEFAULT 0 CHECK (is_offline_ready IN (0, 1)),
  -- Drapeau de retrait : permet de désactiver un deck à distance sans
  -- redéploiement (exigence légale, v2 §5.4).
  can_distribute     INTEGER NOT NULL DEFAULT 1 CHECK (can_distribute IN (0, 1)),
  cover_image_key    TEXT,
  downloaded_at      INTEGER,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE local_cards (
  id                 TEXT    NOT NULL PRIMARY KEY,
  deck_id            TEXT    NOT NULL REFERENCES deck_meta(deck_id) ON DELETE CASCADE,
  type               TEXT    NOT NULL CHECK (type IN ('basic', 'cloze', 'qcm')),
  -- Contenu bilingue sérialisé, même structure que le JSONB serveur.
  content_json       TEXT    NOT NULL,
  -- Provenance et licence : une carte sans source valide ne doit pas exister.
  source_meta_json   TEXT    NOT NULL DEFAULT '{}',
  tags_json          TEXT    NOT NULL DEFAULT '[]',
  card_version       INTEGER NOT NULL DEFAULT 1,
  difficulty_hint    INTEGER CHECK (difficulty_hint BETWEEN 1 AND 5),
  is_premium         INTEGER NOT NULL DEFAULT 1 CHECK (is_premium IN (0, 1)),
  -- Vrai si `content_json` est chiffré (deck premium hors ligne, Phase 8).
  encrypted_flag     INTEGER NOT NULL DEFAULT 0 CHECK (encrypted_flag IN (0, 1)),
  downloaded_at      INTEGER NOT NULL
);

CREATE INDEX idx_cards_deck ON local_cards (deck_id);
CREATE INDEX idx_cards_deck_version ON local_cards (deck_id, card_version);

-- ─────────────────────────────────────────────────────────────────────────────
-- SRS — journal immuable et projection courante
-- ─────────────────────────────────────────────────────────────────────────────

-- APPEND-ONLY. Deux déclencheurs (plus bas) interdisent UPDATE et DELETE :
-- perdre une revue est le seul bug irrattrapable de cette architecture.
CREATE TABLE review_log (
  id                 TEXT    NOT NULL PRIMARY KEY,   -- UUID v7
  user_id            TEXT    NOT NULL,
  card_id            TEXT    NOT NULL,
  device_id          TEXT    NOT NULL,
  rating             INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  duration_ms        INTEGER NOT NULL DEFAULT 0,
  card_type          TEXT    NOT NULL CHECK (card_type IN ('basic', 'cloze', 'qcm')),
  -- Une revue en examen blanc est conservée mais exclue du planificateur.
  exam_mode          INTEGER NOT NULL DEFAULT 0 CHECK (exam_mode IN (0, 1)),
  reviewed_at        INTEGER NOT NULL,               -- horloge de la revue
  received_at        INTEGER NOT NULL,               -- insertion locale
  synced             INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
);

-- Rejoue l'historique d'une carte : ordre (reviewed_at, id) = ordre du fold.
CREATE INDEX idx_review_log_card ON review_log (user_id, card_id, reviewed_at, id);
-- Sélection des événements à pousser.
CREATE INDEX idx_review_log_unsynced ON review_log (user_id, synced, reviewed_at);
-- Statistiques et heatmap.
CREATE INDEX idx_review_log_time ON review_log (user_id, reviewed_at);

CREATE TRIGGER review_log_no_update
BEFORE UPDATE OF id, user_id, card_id, rating, reviewed_at, exam_mode ON review_log
BEGIN
  SELECT RAISE(ABORT, 'review_log est append-only : modification interdite');
END;

CREATE TRIGGER review_log_no_delete
BEFORE DELETE ON review_log
BEGIN
  SELECT RAISE(ABORT, 'review_log est append-only : suppression interdite');
END;

-- Projection dérivée du journal. Peut être reconstruite intégralement.
CREATE TABLE srs_state (
  user_id            TEXT    NOT NULL,
  card_id            TEXT    NOT NULL,
  state              TEXT    NOT NULL DEFAULT 'new'
                       CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  stability          REAL    NOT NULL DEFAULT 0,
  difficulty         REAL    NOT NULL DEFAULT 0,
  elapsed_days       INTEGER NOT NULL DEFAULT 0,
  scheduled_days     INTEGER NOT NULL DEFAULT 0,
  reps               INTEGER NOT NULL DEFAULT 0,
  lapses             INTEGER NOT NULL DEFAULT 0,
  last_review_ms     INTEGER,
  due_ms             INTEGER,
  is_leech           INTEGER NOT NULL DEFAULT 0 CHECK (is_leech IN (0, 1)),
  -- Report volontaire d'une carte (bury siblings) : masquée jusqu'à cette date.
  buried_until_ms    INTEGER,
  updated_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

-- Index critique : construction de la file des cartes dues à chaque ouverture.
CREATE INDEX idx_srs_due ON srs_state (user_id, due_ms);
CREATE INDEX idx_srs_state_stats ON srs_state (user_id, state);

-- ─────────────────────────────────────────────────────────────────────────────
-- SYNCHRONISATION
-- ─────────────────────────────────────────────────────────────────────────────

-- File de sortie : découple l'enregistrement local de l'envoi réseau.
CREATE TABLE outbox_events (
  id                 TEXT    NOT NULL PRIMARY KEY,
  user_id            TEXT    NOT NULL,
  event_type         TEXT    NOT NULL
                       CHECK (event_type IN ('review', 'session', 'report',
                                             'exam_attempt', 'settings')),
  payload_json       TEXT    NOT NULL,
  created_at         INTEGER NOT NULL,
  retry_count        INTEGER NOT NULL DEFAULT 0,
  -- Backoff exponentiel : ne pas réessayer avant cette date.
  next_attempt_at    INTEGER NOT NULL DEFAULT 0,
  last_error         TEXT
);

CREATE INDEX idx_outbox_ready ON outbox_events (user_id, next_attempt_at, created_at);

CREATE TABLE sync_cursor (
  user_id            TEXT    NOT NULL,
  device_id          TEXT    NOT NULL,
  -- Curseur du pull d'événements SRS.
  last_pull_cursor   INTEGER NOT NULL DEFAULT 0,
  last_push_at       INTEGER,
  last_pull_at       INTEGER,
  -- Curseur du pull de contenu (versions de decks).
  content_cursor     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, device_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPTE, DROITS, SESSIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Cache local du droit d'accès. Le serveur reste la seule source de vérité :
-- ce jeton est signé (RS256) et seulement *vérifié* hors ligne.
CREATE TABLE entitlement (
  user_id            TEXT    NOT NULL PRIMARY KEY,
  plan               TEXT    NOT NULL DEFAULT 'free'
                       CHECK (plan IN ('free', 'premium', 'promo')),
  signed_token       TEXT,
  expires_at         INTEGER,
  -- Tolérance réseau : l'accès reste ouvert un temps après expiration.
  grace_until        INTEGER,
  allowed_decks_json TEXT    NOT NULL DEFAULT '[]',
  refreshed_at       INTEGER
);

CREATE TABLE study_sessions (
  id                 TEXT    NOT NULL PRIMARY KEY,
  user_id            TEXT    NOT NULL,
  deck_id            TEXT,
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER,
  cards_due_at_start INTEGER NOT NULL DEFAULT 0,
  cards_reviewed     INTEGER NOT NULL DEFAULT 0,
  correct_count      INTEGER NOT NULL DEFAULT 0,
  xp_earned          INTEGER NOT NULL DEFAULT 0,
  synced             INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
);

CREATE INDEX idx_sessions_user ON study_sessions (user_id, started_at);

-- Compteurs quotidiens : plafonds de nouvelles cartes et anti-burnout (v2 §4).
CREATE TABLE daily_counters (
  user_id            TEXT    NOT NULL,
  day_key            TEXT    NOT NULL,   -- 'YYYY-MM-DD' en heure locale
  new_cards_done     INTEGER NOT NULL DEFAULT 0,
  reviews_done       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day_key)
);

-- Préférences légères (remplace l'usage de Hive côté v2).
CREATE TABLE user_prefs (
  user_id            TEXT    NOT NULL,
  key                TEXT    NOT NULL,
  value              TEXT    NOT NULL,
  PRIMARY KEY (user_id, key)
);
