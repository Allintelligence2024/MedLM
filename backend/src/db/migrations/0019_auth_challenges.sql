-- 0019_auth_challenges — magic link à usage unique (P0 auth).
-- Le token brut n'est jamais stocké : uniquement son empreinte
-- SHA-256 (token_hash). La consommation est tracée via used_at et
-- l'expiration via expires_at (15 min). Le rate limiting s'appuie sur
-- les index email / ip_address / created_at.

CREATE TABLE IF NOT EXISTS auth_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  ip_address   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_challenges_token_hash_idx
  ON auth_challenges (token_hash);
CREATE INDEX IF NOT EXISTS auth_challenges_email_idx
  ON auth_challenges (email);
CREATE INDEX IF NOT EXISTS auth_challenges_ip_idx
  ON auth_challenges (ip_address);
CREATE INDEX IF NOT EXISTS auth_challenges_created_idx
  ON auth_challenges (created_at);
