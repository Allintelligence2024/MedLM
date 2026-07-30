-- MedAnki DZ — migration Phase 7 : Billing, Entitlement, RBAC, Audit.
--
-- Ajouts :
--   * users.rbac_role             — rôle RBAC (student|author|...)
--   * webhook_events             — journal idempotent des webhooks providers
--   * audit_log                  — journal de toute action admin
--
-- Idempotente (IF NOT EXISTS).

ALTER TABLE users ADD COLUMN IF NOT EXISTS rbac_role text NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      text NOT NULL,                -- id côté provider
  provider      text NOT NULL,                -- 'chargily' | 'iap_apple' | ...
  event_type    text NOT NULL,                -- 'checkout.paid' | ...
  payload       jsonb NOT NULL,
  processed     boolean NOT NULL DEFAULT false,
  processed_at  timestamptz,
  received_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_event_id_provider_unique UNIQUE (event_id, provider)
);
CREATE INDEX IF NOT EXISTS webhook_events_unprocessed_idx
  ON webhook_events (provider, processed, received_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action        text NOT NULL,                -- 'publish_card' | 'impersonate' | ...
  target_type   text,                        -- 'card' | 'user' | 'deck'
  target_id     text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address    text,
  user_agent    text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_type, target_id);
