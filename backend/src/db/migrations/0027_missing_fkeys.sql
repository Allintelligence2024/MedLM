-- Phase 4 / R05 — FK nominatives absentes de 0001 (Drizzle les déclarait,
-- PostgreSQL non). Réparer les orphelins AVANT d'ajouter la contrainte.
--
-- review_logs / srs_card_state : ON DELETE RESTRICT — le trigger
-- append-only interdit DELETE ; un CASCADE casserait l'effacement.
-- Les orphelins de review_logs ne sont PAS supprimés : le trigger
-- refuse DELETE. Une base sale échoue fort ici (voulu).

--> statement-breakpoint
UPDATE cards SET created_by = NULL
 WHERE created_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = cards.created_by);

--> statement-breakpoint
UPDATE cards SET reviewed_by = NULL
 WHERE reviewed_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = cards.reviewed_by);

--> statement-breakpoint
UPDATE card_versions SET changed_by = NULL
 WHERE changed_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = card_versions.changed_by);

--> statement-breakpoint
DELETE FROM refresh_tokens t
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id)
    OR NOT EXISTS (SELECT 1 FROM user_devices d WHERE d.id = t.device_id);

--> statement-breakpoint
DELETE FROM user_devices d
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.user_id);

--> statement-breakpoint
DELETE FROM entitlements e
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.user_id);

--> statement-breakpoint
DELETE FROM card_reports r
 WHERE NOT EXISTS (SELECT 1 FROM cards c WHERE c.id = r.card_id)
    OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id);

--> statement-breakpoint
DELETE FROM study_sessions s
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);

--> statement-breakpoint
DELETE FROM sync_cursors s
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);

--> statement-breakpoint
ALTER TABLE user_devices
  ADD CONSTRAINT user_devices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

--> statement-breakpoint
ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

--> statement-breakpoint
ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_device_id_fkey
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE CASCADE;

--> statement-breakpoint
ALTER TABLE entitlements
  ADD CONSTRAINT entitlements_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

--> statement-breakpoint
ALTER TABLE cards
  ADD CONSTRAINT cards_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

--> statement-breakpoint
ALTER TABLE cards
  ADD CONSTRAINT cards_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

--> statement-breakpoint
ALTER TABLE card_versions
  ADD CONSTRAINT card_versions_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;

--> statement-breakpoint
ALTER TABLE card_reports
  ADD CONSTRAINT card_reports_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;

--> statement-breakpoint
ALTER TABLE card_reports
  ADD CONSTRAINT card_reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

--> statement-breakpoint
ALTER TABLE review_logs
  ADD CONSTRAINT review_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

--> statement-breakpoint
ALTER TABLE review_logs
  ADD CONSTRAINT review_logs_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT;

--> statement-breakpoint
ALTER TABLE srs_card_state
  ADD CONSTRAINT srs_card_state_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

--> statement-breakpoint
ALTER TABLE srs_card_state
  ADD CONSTRAINT srs_card_state_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT;

--> statement-breakpoint
ALTER TABLE study_sessions
  ADD CONSTRAINT study_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

--> statement-breakpoint
ALTER TABLE sync_cursors
  ADD CONSTRAINT sync_cursors_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
