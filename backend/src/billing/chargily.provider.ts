import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { z } from 'zod';

export const RemoteCheckout = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive().max(21_474_836),
  currency: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.literal('DZD')),
  status: z.enum([
    'pending',
    'processing',
    'paid',
    'failed',
    'canceled',
    'expired',
  ]),
  checkout_url: z.string().url().optional(),
  livemode: z.boolean().optional(),
  metadata: z.record(z.string()).nullable().optional(),
});
export class CheckoutRejectedError extends Error {}
import {
  IPaymentProvider,
  CheckoutResult,
  PaymentResult,
  HealthStatus,
} from './payment-provider';

export interface ChargilyConfig {
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

  constructor(config: ConfigService) {
    this.config = {
      apiSecret: config.get<string>('CHARGILY_API_SECRET'),
      baseUrl:
        config.get<string>('CHARGILY_API_URL') ??
        this._defaultBaseUrl(config.get<string>('CHARGILY_ENV') ?? 'sandbox'),
      environment:
        (config.get<string>('CHARGILY_ENV') as 'sandbox' | 'production') ??
        'sandbox',
      dryRun: config.get<string>('CHARGILY_DRY_RUN') === 'true',
      maxRetries: config.get<number>('CHARGILY_MAX_RETRIES') ?? 3,
    };
    if (this.config.baseUrl !== this._defaultBaseUrl(this.config.environment))
      throw new Error('CHARGILY_API_URL incohérent avec le mode');
    if (!['sandbox', 'production'].includes(this.config.environment))
      throw new Error('CHARGILY_ENV invalide');
    if (
      config.get<string>('NODE_ENV') === 'production' &&
      (this.config.environment !== 'production' || this.config.dryRun)
    )
      throw new Error('Chargily production requis');
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
    if (this.config.environment === 'production' && !this.config.apiSecret) {
      throw new Error(
        'CHARGILY_API_SECRET obligatoire en production. Refus de démarrer.',
      );
    }
  }

  /// URL par défaut selon l'environnement.
  _defaultBaseUrl(env: string): string {
    return env === 'production'
      ? 'https://pay.chargily.net/api/v2'
      : 'https://pay.chargily.net/test/api/v2';
  }

  /// Health check : GET /v2/balance. Renvoie l'état + l'env.
  async healthCheck(): Promise<HealthStatus> {
    if (this.config.dryRun) {
      return {
        ok: true,
        provider: 'chargily',
        mode: 'dry_run',
        environment: this.config.environment,
      };
    }
    if (!this.config.apiSecret) {
      return {
        ok: false,
        provider: 'chargily',
        mode: 'disabled',
        environment: this.config.environment,
        reason: 'CHARGILY_API_SECRET manquant',
      };
    }
    try {
      const res = await this._fetchWithRetry(`${this.config.baseUrl}/balance`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiSecret}` },
      });
      if (res.ok) {
        return {
          ok: true,
          provider: 'chargily',
          mode: 'live',
          environment: this.config.environment,
        };
      }
      return {
        ok: false,
        provider: 'chargily',
        mode: 'live',
        environment: this.config.environment,
        reason: `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        ok: false,
        provider: 'chargily',
        mode: 'live',
        environment: this.config.environment,
        reason: (e as Error).message,
      };
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
    if (
      !Number.isSafeInteger(args.amount_cents) ||
      args.amount_cents <= 0 ||
      args.amount_cents % 100 !== 0
    )
      throw new BadRequestException('Chargily exige un montant entier en DZD');
    for (const redirect of [args.successUrl, args.cancelUrl]) {
      if (redirect && new URL(redirect).origin !== 'https://medanki.dz')
        throw new BadRequestException('origine de retour non autorisée');
    }
    if (this.config.dryRun) {
      const fakeId = `dryrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.logger.log(
        `[DRY-RUN] createPayment: fake checkout ${fakeId} for user ${args.userId}`,
      );
      return {
        url: `https://medanki.dz/billing/dryrun?ref=${fakeId}`,
        providerRef: fakeId,
        amount_cents: args.amount_cents,
        currency: 'DZD',
      };
    }
    if (!this.config.apiSecret) {
      throw new CheckoutRejectedError(
        'CHARGILY_API_SECRET manquant — provider Chargily désactivé.',
      );
    }
    const body = {
      amount: args.amount_cents / 100,
      currency: 'dzd' as const,
      chargily_pay_fees_allocation: 'merchant',
      success_url:
        args.successUrl ??
        'https://medanki.dz/billing/success?ref={checkout_id}',
      failure_url: args.cancelUrl ?? 'https://medanki.dz/billing/cancel',
      metadata: {
        user_id: args.userId,
        plan: args.plan,
        ...args.metadata,
      },
    };
    const res = await this._fetchWithRetry(`${this.config.baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Unknown outcomes retain the local reservation; never retry a POST.
      if ([400, 401, 403, 422].includes(res.status))
        throw new CheckoutRejectedError(`Chargily HTTP ${res.status}`);
      throw new Error(`Chargily checkout outcome unknown: HTTP ${res.status}`);
    }
    const data = this.validateCheckout(await res.json());
    if (
      !data.checkout_url ||
      data.amount * 100 !== args.amount_cents ||
      data.status !== 'pending'
    )
      throw new Error('réponse Chargily incohérente');
    const checkoutUrl = new URL(data.checkout_url);
    if (
      checkoutUrl.protocol !== 'https:' ||
      !['pay.chargily.net', 'pay.chargily.dz'].includes(checkoutUrl.hostname)
    )
      throw new Error('URL checkout Chargily invalide');
    return {
      url: data.checkout_url,
      providerRef: data.id,
      amount_cents: data.amount * 100,
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
    const expected = createHmac('sha256', this.config.apiSecret)
      .update(rawBody)
      .digest('hex');
    return (
      expected.length === signature.length &&
      timingSafeEqual(expected, signature)
    );
  }

  async handleWebhook(args: {
    eventId: string;
    eventType: string;
    payload: unknown;
    signature: string | null;
  }): Promise<PaymentResult> {
    const p = args.payload as {
      id?: string;
      status?: string;
      amount?: number;
    } | null;
    const ref = p?.id ?? args.eventId;
    this.logger.log(
      `webhook: eventId=${args.eventId} type=${args.eventType} ref=${ref}`,
    );

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
    return {
      confirmed: false,
      providerRef: ref,
      reason: `unknown_event:${args.eventType}`,
    };
  }

  validateCheckout(value: unknown) {
    const checkout = RemoteCheckout.parse(value);
    if (
      checkout.livemode !== undefined &&
      checkout.livemode !== (this.config.environment === 'production')
    )
      throw new BadRequestException('mode Chargily incohérent');
    return checkout;
  }

  async retrieveCheckout(ref: string) {
    if (this.config.dryRun || !this.config.apiSecret)
      throw new Error('rapprochement Chargily réel indisponible');
    const res = await this._fetchWithRetry(
      `${this.config.baseUrl}/checkouts/${encodeURIComponent(ref)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiSecret}` },
      },
    );
    if (!res.ok) throw new Error(`Chargily retrieval HTTP ${res.status}`);
    const checkout = this.validateCheckout(await res.json());
    if (checkout.id !== ref) throw new Error('référence Chargily incohérente');
    return checkout;
  }

  async refund(
    _providerRef: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    return {
      ok: false,
      reason:
        'unsupported: remboursement manuel via Chargily, puis rapprochement audité',
    };
  }

  /// Fetch avec retry exponentiel sur 429/5xx.
  private async _fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const retries =
      init.method === 'GET'
        ? Math.min(3, Math.max(0, Number(this.config.maxRetries) || 0))
        : 0;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(20_000),
          redirect: 'error',
        });
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt < retries) {
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
        if (attempt < retries) {
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
