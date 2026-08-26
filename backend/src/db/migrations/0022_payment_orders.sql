-- 0022_payment_orders — commandes de paiement internes (P0 paiement).
-- Trace chaque webhook de paiement avec validation côté serveur
-- (provider_ref, montant, devise, plan) et traitement idempotent.

CREATE TABLE IF NOT EXISTS payment_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      text NOT NULL DEFAULT 'chargily',
  provider_ref  text NOT NULL,
  amount_cents  integer NOT NULL,
  currency      text NOT NULL DEFAULT 'DZD',
  plan          text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  raw_payload   jsonb NOT NULL DEFAULT '{}',
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_ref_idx
  ON payment_orders (provider_ref);
CREATE INDEX IF NOT EXISTS payment_orders_user_idx
  ON payment_orders (user_id);
CREATE INDEX IF NOT EXISTS payment_orders_status_idx
  ON payment_orders (status);
