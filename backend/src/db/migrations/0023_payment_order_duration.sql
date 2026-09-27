-- Store the contractual duration, including promotions, before checkout.
-- Do NOT guess historic promo terms: existing NULL rows must be reconciled
-- from provider/merchant records before pending payments can be credited.
ALTER TABLE payment_orders ADD COLUMN duration_days integer;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_duration_days_check
  CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650);
