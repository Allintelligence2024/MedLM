/// DTOs Billing — entrée / sortie des endpoints paiement.
import { z } from 'zod';

export const PLANS = ['monthly', 'semester', 'yearly', 'group'] as const;
export type PlanId = (typeof PLANS)[number];

/// Prix en DA (dinar algérien), conformes à la grille v2 §10.2.
export const PLAN_PRICING_DA: Record<PlanId, number> = {
  monthly: 350,
  semester: 1500,
  yearly: 2400,
  group: 2400 * 5 * 0.7, // pack 5 étudiants −30 %
};

/// Jours de validité付与 par plan.
export const PLAN_DURATION_DAYS: Record<PlanId, number> = {
  monthly: 30,
  semester: 180,
  yearly: 365,
  group: 365,
};

export const CreateCheckoutBody = z.object({
  plan: z.enum(PLANS),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
  promo_code: z.string().max(64).optional(),
});
export type CreateCheckoutBody = z.infer<typeof CreateCheckoutBody>;

export const ApplyPromoBody = z.object({
  code: z.string().min(1).max(64),
  plan: z.enum(PLANS),
});
export type ApplyPromoBody = z.infer<typeof ApplyPromoBody>;

/// Corps d'un webhook Chargily. Voir la doc :
///   https://dev.chargily.com/docs/api/endpoints#webhook-events
/// On accepte la structure générique (Zod `passthrough` pour tolérer
/// les champs que la lib ajoute au fil du temps).
export const ChargilyWebhookEvent = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type ChargilyWebhookEvent = z.infer<typeof ChargilyWebhookEvent>;
