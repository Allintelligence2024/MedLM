-- Additive upgrade. Legacy amounts are NOT reinterpreted as dinars.
ALTER TABLE payment_orders ADD COLUMN contract_version integer NOT NULL DEFAULT 1;
ALTER TABLE payment_orders ADD COLUMN promo_code text REFERENCES promo_codes(code);
ALTER TABLE payment_orders ADD COLUMN group_pack_id uuid REFERENCES group_packs(id);
ALTER TABLE payment_orders ADD COLUMN checkout_url text;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_contract_version_check CHECK (contract_version IN (1, 2));
CREATE INDEX payment_orders_promo_pending_idx ON payment_orders(promo_code) WHERE status = 'pending';
CREATE UNIQUE INDEX payment_orders_group_live_idx ON payment_orders(group_pack_id)
  WHERE group_pack_id IS NOT NULL AND status IN ('pending', 'paid');
CREATE TABLE payment_order_beneficiaries (
  order_id uuid NOT NULL REFERENCES payment_orders(id),
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (order_id, user_id)
);
-- Only individual legacy orders have an unambiguous beneficiary.
INSERT INTO payment_order_beneficiaries(order_id, user_id)
SELECT id, user_id FROM payment_orders WHERE plan IN ('monthly', 'semester', 'yearly');
ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_status_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'expired'));
