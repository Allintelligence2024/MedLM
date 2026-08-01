// BillingService — orchestrates the payment providers and the entitlement
// lifecycle. This is the single entry point for "create a checkout" and
// "process a webhook" — the controllers stay thin.
import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { entitlements, users, webhookEvents } from '../db/schema';
import { PaymentResult } from './payment-provider';
import { ChargilyPayProvider } from './chargily.provider';
import { PromoCodeProvider } from './promo-code.provider';
import { PLAN_DURATION_DAYS, PLAN_PRICING_DA, PlanId } from './billing.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly gracePeriodSeconds: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly chargily: ChargilyPayProvider,
    private readonly promo: PromoCodeProvider,
    config: ConfigService,
  ) {
    this.gracePeriodSeconds =
      config.get<number>('ENTITLEMENT_GRACE_PERIOD_SECONDS') ?? 1_209_600; // 14j
  }

  /// POST /v1/billing/checkout — crée un checkout Chargily.
  async createCheckout(args: {
    userId: string;
    plan: PlanId;
    promoCode?: string;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ url: string; providerRef: string; finalCents: number }> {
    const plan = args.plan;
    if (!(plan in PLAN_PRICING_DA)) {
      throw new BadRequestException(`plan inconnu : ${plan}`);
    }
    let baseCents = PLAN_PRICING_DA[plan] * 100;
    let durationDays = PLAN_DURATION_DAYS[plan];

    if (args.promoCode) {
      const r = await this.promo.resolve({
        code: args.promoCode,
        plan,
        baseCents,
      });
      baseCents = r.finalCents;
      durationDays = r.durationDays;
    }

    const user = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, args.userId))
      .then((rows) => rows[0]);
    if (!user) throw new BadRequestException('utilisateur inconnu');

    const checkout = await this.chargily.createPayment({
      userId: args.userId,
      userEmail: user.email,
      plan,
      amount_cents: baseCents,
      ...(args.successUrl !== undefined && { successUrl: args.successUrl }),
      ...(args.cancelUrl !== undefined && { cancelUrl: args.cancelUrl }),
      metadata: { plan, durationDays: String(durationDays) },
    });
    return { url: checkout.url, providerRef: checkout.providerRef, finalCents: baseCents };
  }

  /// POST /v1/billing/webhook/chargily — endpoint public signé.
  /// Le contrôleur a déjà vérifié la signature et passé le rawBody.
  async handleChargilyWebhook(args: {
    eventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<{ processed: boolean; reason?: string }> {
    return this.db.transaction(async (tx) => {
      // 1. Idempotence : on a déjà vu cet eventId ?
      const seen = await tx
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.eventId, args.eventId))
        .then((rows) => rows[0]);
      if (seen) {
        return { processed: true, reason: 'already_seen' };
      }
      // 2. On log l'event AVANT traitement (audit, replay).
      await tx.insert(webhookEvents).values({
        eventId: args.eventId,
        provider: 'chargily',
        eventType: args.eventType,
        payload: args.payload as object,
        processed: false,
      });
      // 3. Délègue au provider pour l'interprétation.
      const result: PaymentResult = await this.chargily.handleWebhook({
        eventId: args.eventId,
        eventType: args.eventType,
        payload: args.payload,
        signature: null, // déjà vérifiée par le contrôleur
      });
      // 4. Si confirmé, on crédite l'utilisateur.
      if (result.confirmed) {
        const meta = (args.payload as { metadata?: Record<string, string> }).metadata ?? {};
        const userId = meta['user_id'];
        const plan = meta['plan'] ?? 'yearly';
        const durationDays = Number(meta['durationDays'] ?? 365);
        if (userId) {
          await this.creditEntitlement(tx as unknown as Database, {
            userId,
            plan,
            durationDays,
            providerRef: result.providerRef,
          });
        }
      }
      // 5. Marque l'event comme traité.
      await tx
        .update(webhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(eq(webhookEvents.eventId, args.eventId));
      return { processed: true };
    });
  }

  /// Crédite / renouvelle l'entitlement d'un utilisateur.
  /// Si un entitlement actif existe, on étend à partir de `expiresAt`.
  private async creditEntitlement(
    db: Database,
    args: { userId: string; plan: string; durationDays: number; providerRef: string },
  ): Promise<void> {
    const existing = await db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, args.userId), eq(entitlements.plan, args.plan)))
      .then((rows) => rows[0]);
    const now = new Date();
    const start = existing && existing.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
    const expires = new Date(start.getTime() + args.durationDays * 86_400_000);
    const grace = new Date(expires.getTime() + this.gracePeriodSeconds * 1000);
    await db
      .insert(entitlements)
      .values({
        userId: args.userId,
        plan: args.plan,
        startsAt: start,
        expiresAt: expires,
        graceUntil: grace,
        paymentProvider: 'chargily',
        paymentRef: args.providerRef,
      })
      .onConflictDoUpdate({
        target: [entitlements.userId, entitlements.plan],
        set: { expiresAt: expires, graceUntil: grace, paymentRef: args.providerRef },
      });
    this.logger.log(
      `entitlement credited: user=${args.userId} plan=${args.plan} expires=${expires.toISOString()}`,
    );
  }

  /// État d'entitlement courant (utilisé par l'endpoint /v1/entitlement).
  async currentEntitlement(userId: string): Promise<{
    plan: 'free' | 'premium' | 'promo';
    expiresAtMs: number;
    graceUntilMs: number;
    isActive: boolean;
  }> {
    const rows = await this.db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, userId))
      .orderBy(entitlements.expiresAt);
    const now = Date.now();
    // On prend l'entitlement le plus long qui couvre `now`.
    let best: typeof rows[number] | undefined;
    for (const r of rows) {
      if (r.expiresAt && r.expiresAt.getTime() > now) {
        if (!best || (best.expiresAt && r.expiresAt > best.expiresAt)) best = r;
      }
    }
    if (!best) return { plan: 'free', expiresAtMs: 0, graceUntilMs: 0, isActive: false };
    const graceMs = best.graceUntil ? best.graceUntil.getTime() : 0;
    return {
      plan: (best.plan as 'free' | 'premium' | 'promo') ?? 'free',
      expiresAtMs: best.expiresAt ? best.expiresAt.getTime() : 0,
      graceUntilMs: graceMs,
      isActive: best.expiresAt ? best.expiresAt.getTime() > now : false,
    };
  }
}
