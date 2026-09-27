ALTER TABLE "admin_mfa"
  ADD COLUMN IF NOT EXISTS "pending_ciphertext" bytea,
  ADD COLUMN IF NOT EXISTS "pending_iv" bytea,
  ADD COLUMN IF NOT EXISTS "pending_tag" bytea,
  ADD COLUMN IF NOT EXISTS "pending_created_at" timestamp with time zone;
