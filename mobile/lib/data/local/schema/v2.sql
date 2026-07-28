-- Migration v1 → v2
--
-- Démontre et verrouille la politique de migration : on ajoute des colonnes et
-- des tables, on ne détruit jamais de données utilisateur. Le prototype Android
-- utilisait `fallbackToDestructiveMigration()`, ce qui effaçait toute la
-- progression SRS à chaque changement de schéma — c'est précisément ce que
-- cette phase supprime.
--
-- Contenu fonctionnel de la v2 : signalement d'erreur sur une carte
-- (v2 §6, endpoint POST /cards/:id/report) et suivi de la révision médicale.

-- Signalements émis par l'étudiant, mis en file pour envoi.
CREATE TABLE card_reports (
  id                 TEXT    NOT NULL PRIMARY KEY,
  user_id            TEXT    NOT NULL,
  card_id            TEXT    NOT NULL,
  reason             TEXT    NOT NULL,
  comment            TEXT    NOT NULL DEFAULT '',
  created_at         INTEGER NOT NULL,
  synced             INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
);

CREATE INDEX idx_reports_unsynced ON card_reports (user_id, synced, created_at);

-- Une carte signalée est affichée avec un avertissement jusqu'à correction.
ALTER TABLE local_cards ADD COLUMN reported_flag INTEGER NOT NULL DEFAULT 0;

-- Date de publication côté serveur : permet de trier les nouveautés d'un deck.
ALTER TABLE local_cards ADD COLUMN published_at INTEGER;

-- Compteur de gel de série (streak freeze), consommé mensuellement (v2 §9.3).
ALTER TABLE daily_counters ADD COLUMN freeze_used INTEGER NOT NULL DEFAULT 0;
