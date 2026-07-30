-- Migration 0007 — deck_key_wrapped (Phase 14).
--
-- Une ligne = une clé AES-256 wrappée en RSA-OAEP-SHA256 pour
-- un (user, device, deck). Le serveur ne stocke JAMAIS la clé
-- AES en clair (cf. v2 §8.1 forward secrecy).

CREATE TABLE IF NOT EXISTS deck_key_wrapped (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id     UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  wrapped_key BYTEA NOT NULL,
  algorithm   TEXT NOT NULL DEFAULT 'rsa-oaep-sha256',
  revoked_at  TIMESTAMPTZ,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index principal : (user, deck, device) pour le lookup.
CREATE INDEX IF NOT EXISTS deck_key_wrapped_user_deck_device_idx
  ON deck_key_wrapped (user_id, deck_id, device_id);

-- Index pour la révocation : clés actives d'un user.
CREATE INDEX IF NOT EXISTS deck_key_wrapped_user_active_idx
  ON deck_key_wrapped (user_id, revoked_at);
