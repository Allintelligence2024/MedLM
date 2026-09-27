CREATE TABLE IF NOT EXISTS "admin_mfa" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "secret_ciphertext" bytea NOT NULL,
  "secret_iv" bytea NOT NULL,
  "secret_tag" bytea NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "last_counter" bigint,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "confirmed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "admin_mfa_backup_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_mfa_backup_codes_hash_idx"
  ON "admin_mfa_backup_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "admin_mfa_backup_codes_user_idx"
  ON "admin_mfa_backup_codes" ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_user_token_idx"
  ON "user_devices" ("user_id", "device_token")
  WHERE "device_token" IS NOT NULL;
