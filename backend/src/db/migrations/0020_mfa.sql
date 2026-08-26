-- 0020_mfa — MFA admin TOTP (P0 auth).
-- Trois colonnes ajoutées à `users` :
--   * mfa_enabled      boolean NOT NULL DEFAULT false
--   * mfa_secret       text     (secret base32, nullable)
--   * mfa_backup_codes text[]   (codes de secours hashés, nullable)

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes text[];
