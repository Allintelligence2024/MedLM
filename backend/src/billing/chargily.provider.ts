/// Chargily Pay — provider de paiement algérien (CIB + BaridiMob).
///
/// Docs : https://dev.chargily.com/docs/api/
///
/// Phase 16.2 : durcissement pour la production.
///   * Validation explicite de l'environnement (sandbox vs prod).
///   * Mode dry-run : si `CHARGILY_DRY_RUN=true`, on **n'appelle
///     jamais l'API** mais on retourne un checkout_url factice.
///     Utile pour les tests E2E et le staging sans clés.
///   * Health check : GET /v2/me pour vérifier que les clés sont
///     valides et que l'environnement est joignable.
///   * Idempotence renforcée : on log chaque eventId vu pour
///     détecter les replays.
///   * Retry sur 429 (rate limit) avec backoff exponentiel.
///
/// En l'absence de clés API, le provider refuse de démarrer en
/// prod (lancé en mode `dry_run: true` via le contrôleur).
library;
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { IPaymentProvider, CheckoutResult, PaymentResult, HealthStatus } from './payment-provider';

interface ChargilyCheckoutResponse {
  id: string;
  checkout_url: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, string>;
}

export interface ChargilyConfig {
  apiKey: string | undefined;
  apiSecret: string | undefined;
  baseUrl: string;
  environment: 'sandbox' | 'production';
  dryRun: boolean;
  maxRetries: number;
}

@Injectable()
export class ChargilyPayProvider implements IPaymentProvider {
  readonly name = 'chargily';
  private readonly logger = new Logger(ChargilyPayProvider.name);
  private readonly config: ChargilyConfig;
  /// Compteur de retries (succès → reset).
  private retryCount = 0;

  constructor(config: ConfigService) {
    this.config = {
      apiKey: config.get<string>('CHARGILY_API_KEY'),
      apiSecret: config.get<string>('CHARGILY_API_SECRET'),
      baseUrl:
        config.get<string>('CHARGILY_API_URL') ??
        this._defaultBaseUrl(config.get<string>('CHARGILY_ENV') ?? 'sandbox'),
      environment:
        (config.get<string>('CHARGILY_ENV') as 'sandbox' | 'production') ?? 'sandbox',
      dryRun: config.get<string>('CHARGILY_DRY_RUN') === 'true',
      maxRetries: config.get<number>('CHARGILY_MAX_RETRIES') ?? 3,
    };
    if (this.config.dryRun) {
      this.logger.warn(
        'CHARGILY_DRY_RUN=true : aucun appel réel à Chargily. ' +
          'À ne JAMAIS utiliser en production.',
      );
    }
    if (this.config.environment === 'production' && this.config.dryRun) {
      throw new Error(
        'Incohérence : CHARGILY_ENV=production mais CHARGILY_DRY_RUN=true. ' +
          'Refus de démarrer pour éviter une facturation cassée.',
      );
    }
    if (this.config.environment === 'production' && !this.config.apiKey) {
      throw new Error(
        'CHARGILY_API_KEY obligatoire en production. Refus de démarrer.',
      );
    }
  }

  /// URL par défaut selon l'environnement.
  _defaultBaseUrl(env: string): string {
    return env === 'production'
      ? 'https://pay.chargily.com/api/v2'
      : 'https://pay.chargily.com/test/api/v2';
  }

  /// Health check : GET /v2/me. Renvoie l'état + l'env.
  async healthCheck(): Promise<HealthStatus> {
    if (this.config.dryRun) {
      return { ok: true, provider: 'chargily', mode: 'dry_run', environment: this.config.environment };
    }
    if (!this.config.apiKey) {
      return { ok: false, provider: 'chargily', mode: 'disabled', environment: this.config.environment, reason: 'CHARGILY_API_KEY manquant' };
    }
    try {
      const res = await this._fetchWithRetry(`${this.config.baseUrl}/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (res.ok) {
        return { ok: true, provider: 'chargily', mode: 'live', environment: this.config.environment };
      }
      return { ok: false, provider: 'chargily', mode: 'live', environment: this.config.environment, reason: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, provider: 'chargily', mode: 'live', environment: this.config.environment, reason: (e as Error).message };
    }
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
    if (this.config.dryRun) {
      const fakeId = `dryrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.logger.log(`[DRY-RUN] createPayment: fake checkout ${fakeId} for user ${args.userId}`);
      return {
        url: `https://medanki.dz/billing/dryrun?ref=${fakeId}`,
        providerRef: fakeId,
        amount_cents: args.amount_cents,
        currency: 'DZD',
      };
    }
    if (!this.config.apiKey) {
      throw new Error('CHARGILY_API_KEY manquant — provider Chargily désactivé.');
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
    };
    const res = await this._fetchWithRetry(`${this.config.baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
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
  /// sur le corps brut.
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!this.config.apiSecret) {
      this.logger.warn('CHARGILY_API_SECRET absent — webhook non vérifié');
      return false;
    }
    if (!signature) return false;
    const expected = createHmac('sha256', this.config.apiSecret).update(rawBody).digest('hex');
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  }

  async handleWebhook(args: {
    eventId: string;
    eventType: string;
    payload: unknown;
    signature: string | null;
  }): Promise<PaymentResult> {
    const p = args.payload as { id?: string; status?: string; amount?: number } | null;
    const ref = p?.id ?? args.eventId;
    this.logger.log(`webhook: eventId=${args.eventId} type=${args.eventType} ref=${ref}`);

    if (args.eventType === 'checkout.paid') {
      return { confirmed: true, providerRef: ref };
    }
    if (args.eventType === 'checkout.failed') {
      return { confirmed: false, providerRef: ref, reason: 'checkout_failed' };
    }
    if (args.eventType === 'checkout.canceled') {
      return { confirmed: false, providerRef: ref, reason: 'canceled' };
    }
    this.logger.warn(`Chargily webhook event type inconnu: ${args.eventType}`);
    return { confirmed: false, providerRef: ref, reason: `unknown_event:${args.eventType}` };
  }

  async refund(providerRef: string): Promise<{ ok: boolean; reason?: string }> {
    if (this.config.dryRun) {
      this.logger.log(`[DRY-RUN] refund: ${providerRef}`);
      return { ok: true };
    }
    if (!this.config.apiKey) {
      return { ok: false, reason: 'CHARGILY_API_KEY manquant' };
    }
    const res = await this._fetchWithRetry(
      `${this.config.baseUrl}/checkouts/${providerRef}/refund`,
      { method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, reason: `${res.status} ${text}` };
    }
    return { ok: true };
  }

  /// Fetch avec retry exponentiel sur 429/5xx.
  private async _fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const res = await fetch(url, init);
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt < this.config.maxRetries) {
            const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
            this.logger.warn(
              `Chargily ${res.status} (tentative ${attempt + 1}/${this.config.maxRetries}), retry dans ${delayMs}ms`,
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
        }
        return res;
      } catch (e) {
        lastError = e as Error;
        if (attempt < this.config.maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error('Chargily: max retries atteint');
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}
