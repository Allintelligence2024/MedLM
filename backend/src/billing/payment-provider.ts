/// Interface `IPaymentProvider` — la frontière entre l'app et les providers
/// de paiement (Chargily Pay, Apple/Google IAP plus tard, etc.).
///
/// Pourquoi une interface ?
///   * Tester le service billing sans toucher au réseau ;
///   * Permettre l'ajout d'un nouveau provider sans toucher au code
///     métier ;
///   * Documenter le contrat minimal : createPayment, handleWebhook,
///     refund.
export interface CheckoutResult {
  /// URL où l'utilisateur doit être redirigé pour payer.
  url: string;
  /// Identifiant côté provider — à conserver pour la réconciliation.
  providerRef: string;
  /// Montant final en centimes (DA × 100). Pour les DA, l'unité
  /// pratique est le centime : 2400 DA = 240000.
  amount_cents: number;
  /// Devise (toujours 'DZD' pour la v1 — pas de conversion).
  currency: 'DZD';
}

export interface PaymentResult {
  /// true si le paiement est confirmé, false si en attente / échec.
  confirmed: boolean;
  /// Référence côté provider (idempotence).
  providerRef: string;
  /// Code d'erreur éventuel (utile pour les logs, pas pour l'utilisateur).
  reason?: string;
}

export interface IPaymentProvider {
  /// Nom du provider : 'chargily', 'iap_apple', 'iap_google', 'promo'.
  readonly name: string;

  /// Crée une session de paiement. Retourne une URL à présenter à
  /// l'utilisateur (page web Chargily, StoreKit sheet, etc.).
  createPayment(args: {
    userId: string;
    userEmail: string;
    plan: string;
    amount_cents: number;
    successUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutResult>;

  /// Vérifie un événement webhook et le traduit en PaymentResult
  /// normalisé. Doit être **idempotent** : appelé deux fois avec le
  /// même `eventId` doit retourner le même résultat.
  handleWebhook(args: {
    eventId: string;
    eventType: string;
    payload: unknown;
    signature: string | null;
  }): Promise<PaymentResult>;

  /// Rembourse un paiement (utilisé par l'admin uniquement).
  refund(providerRef: string): Promise<{ ok: boolean; reason?: string }>;
}
