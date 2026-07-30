// DTOs Group packs (Phase 16.3).
//
// v2 §8.2 — "Pack groupe : 5 étudiants -30%".
//
// Un pack groupe est un achat groupé : un user "coordinateur"
// crée le pack, invite 4 autres étudiants, et quand le pack
// est complet, le paiement est débité (avec 30% de réduction)
// et les 5 entitlements sont activés simultanément.
import { z } from 'zod';

/// Body : crée un pack groupe. Le créateur devient
/// automatiquement le 1er membre (coordonnateur).
export const CreatePackBody = z.object({
  /// Plan sous-jacent (yearly, monthly, etc.).
  plan: z.enum(['monthly', 'semester', 'yearly']),
  /// Faculté (pour info, pas bloquant).
  faculty: z.string().max(100).optional(),
});
export type CreatePackBody = z.infer<typeof CreatePackBody>;

/// Body : rejoindre un pack groupe (avec son code d'invitation).
export const JoinPackBody = z.object({
  /// Code d'invitation à 6 caractères.
  invite_code: z.string().min(6).max(6).regex(/^[A-Z0-9]{6}$/),
});
export type JoinPackBody = z.infer<typeof JoinPackBody>;

/// Réponse : état d'un pack.
export interface GroupPackView {
  id: string;
  plan: string;
  faculty: string | null;
  coordinator_user_id: string;
  invite_code: string;
  status: 'pending' | 'full' | 'paid' | 'cancelled' | 'expired';
  member_count: number;
  members: Array<{
    user_id: string;
    email: string;
    is_coordinator: boolean;
    joined_at: string;
  }>;
  /// Coût total (par user) après réduction groupe, en centimes.
  per_user_cents: number;
  /// Économie totale du pack (5 × prix normal - 5 × prix réduit).
  total_savings_cents: number;
  /// Date d'expiration du pack (24h après création).
  expires_at: string;
  /// URL de paiement (Chargily) si status === 'full'.
  payment_url: string | null;
  created_at: string;
}
