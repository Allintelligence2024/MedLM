-- 0021_oauth_states — state OAuth2 à usage unique (P0 OAuth).
-- Le state est généré côté serveur, stocké sous forme d'empreinte
-- SHA-256, et consommé de façon atomique lors du callback Google.

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash  text PRIMARY KEY,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_states_expires_idx
  ON oauth_states (expires_at);
CREATE INDEX IF NOT EXISTS oauth_states_created_idx
  ON oauth_states (created_at);
