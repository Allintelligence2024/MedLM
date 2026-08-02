-- Migration 0018 — un epoch en millisecondes ne tient pas dans INTEGER.
-- PostgreSQL INTEGER est signé sur 32 bits (≈ 2,1 milliards), alors que
-- Date.now() vaut ≈ 1,7 billion. Le journal anti-triche refusait donc tous
-- les événements émis par un client réel.
ALTER TABLE exam_attempt_events
  ALTER COLUMN client_ts TYPE BIGINT;
