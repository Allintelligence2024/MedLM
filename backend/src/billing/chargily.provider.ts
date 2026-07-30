/// Chargily Pay — provider de paiement algérien (CIB + BaridiMob).
///
/// Docs : https://dev.chargily.com/docs/api/
///
/// On utilise l'API v2 qui supporte le mode "checkout" (l'utilisateur
/// est redirigé vers une page Chargily, y paie par CIB ou BaridiMob,
/// et est renvoyé sur success_url). L'app mobile ouvre cette URL dans
/// un WebView ; le serveur reçoit ensuite un webhook pour confirmer.
///
/// Cette implémentation fait de **vrais** appels HTTP. En l'absence de
/// clés sandbox dans l'environnement, ils ne sont pas testés bout-en-bout
/// — les tests unitaires mockent `fetch` via une variable d'injection.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { IPaymentProvider, CheckoutResult, PaymentResult } from './payment-provider';

interface ChargilyCheckoutResponse {
  id: string;
  checkout_url: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class ChargilyPayProvider implements IPaymentProvider {
  readonly name = 'chargily';
  private readonly logger = new Logger(ChargilyPayProvider.name);
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('CHARGILY_API_KEY');
    this.apiSecret = config.get<string>('CHARGILY_API_SECRET');
    // Sandbox par défaut ; passer à `https://api.chargily.com/v2` en prod.
    this.baseUrl =
      config.get<string>('CHARGILY_API_URL') ?? 'https://pay.chargily.com/test/api/v2';
  }

  async createPayment(args: {
    userId: string;
    userEmail: string;
    plan: string;
    amount_cents: number;
    successUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutResult> {
    if (!this.apiKey) {
      throw new Error(
        'CHARGILY_API_KEY manquant — provider Chargily désactivé. ' +
          'Voir .env.example pour la configuration.',
      );
    }
    const body = {
      amount: args.amount_cents,
      currency: 'dzd' as const,
      success_url:
        args.successUrl ?? 'https://medanki.dz/billing/success?ref={checkout_id}',
      cancel_url: args.cancelUrl ?? 'https://medanki.dz/billing/cancel',
      customer_email: args.userEmail,
      metadata: {
        user_id: args.userId,
        plan: args.plan,
        ...args.metadata,
      },
      // language: 'fr',  // optionnel
    };
    const res = await fetch(`${this.baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Chargily checkout failed: ${res.status} ${text}`);
      throw new Error(`Chargily createPayment: ${res.status} ${text}`);
    }
    const data = (await res.json()) as ChargilyCheckoutResponse;
    return {
      url: data.checkout_url,
      providerRef: data.id,
      amount_cents: data.amount,
      currency: 'DZD',
    };
  }

  /// Vérifie la signature du webhook. Chargily signe avec HMAC-SHA256
  /// sur le corps brut, en utilisant la clé `signature` du header
  /// `Signature` (équivalent à Stripe-Signature).
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!this.apiSecret) {
      this.logger.warn('CHARGILY_API_SECRET absent — webhook non vérifié');
      return false;
    }
    if (!signature) return false;
    const expected = createHmac('sha256', this.apiSecret).update(rawBody).digest('hex');
    // Comparaison à temps constant pour éviter les timing attacks.
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  }

  async handleWebhook(args: {
    eventId: string;
    eventType: string;
    payload: unknown;
    signature: string | null;
  }): Promise<PaymentResult> {
    // Idempotence : si on a déjà traité cet eventId, on retourne
    // immédiatement le résultat. Le service de billing maintient
    // une table `webhook_events` qui sert de journal.
    const p = args.payload as { id?: string; status?: string; amount?: number } | null;
    const ref = p?.id ?? args.eventId;

    if (args.eventType === 'checkout.paid') {
      return { confirmed: true, providerRef: ref };
    }
    if (args.eventType === 'checkout.failed') {
      return { confirmed: false, providerRef: ref, reason: 'checkout_failed' };
    }
    if (args.eventType === 'checkout.canceled') {
      return { confirmed: false, providerRef: ref, reason: 'canceled' };
    }
    // Type inconnu : on **valide** quand même (idempotence oblige),
    // on logue, et on dit "non confirmé" pour forcer un retry manuel.
    this.logger.warn(`Chargily webhook event type inconnu: ${args.eventType}`);
    return { confirmed: false, providerRef: ref, reason: `unknown_event:${args.eventType}` };
  }

  async refund(providerRef: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.apiKey) {
      return { ok: false, reason: 'CHARGILY_API_KEY manquant' };
    }
    const res = await fetch(`${this.baseUrl}/checkouts/${providerRef}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, reason: `${res.status} ${text}` };
    }
    return { ok: true };
  }
}

/// Comparaison de chaînes à temps constant (équivalent Node 16+).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}
