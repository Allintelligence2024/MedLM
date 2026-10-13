// BillingService — orchestrates the payment providers and the entitlement
// lifecycle. This is the single entry point for "create a checkout" and
// "process a webhook" — the controllers stay thin.
import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, sql, asc } from 'drizzle-orm';
import { z } from 'zod';
import { DRIZZLE, Database } from '../db/database.module';
import {
  entitlements,
  paymentOrders,
  users,
  webhookEvents,
  paymentOrderBeneficiaries,
  groupPacks,
  groupPackMembers,
  promoCodes,
  auditLog,
} from '../db/schema';
import { PaymentResult } from './payment-provider';
import {
  ChargilyPayProvider,
  CheckoutRejectedError,
} from './chargily.provider';
import { PromoCodeProvider } from './promo-code.provider';
import { PLAN_DURATION_DAYS, PLAN_PRICING_DA, PlanId } from './billing.dto';

type BillingTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const PaidCheckout = z.object({
  status: z.literal('paid'),
  id: z.string().min(1),
  amount: z.number().int().positive().max(2_147_483_647),
  currency: z
    .string()
    .transform((value) => value.toUpperCase())
    .pipe(z.literal('DZD')),
});

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
    this.gracePeriodSeconds = Number(
      config.get<string | number>('ENTITLEMENT_GRACE_PERIOD_SECONDS') ??
        1_209_600,
    );
    if (
      !Number.isSafeInteger(this.gracePeriodSeconds) ||
      this.gracePeriodSeconds < 0 ||
      this.gracePeriodSeconds > 1_209_600
    )
      throw new Error('grace period invalide (0..14 jours)');
  }

  /// POST /v1/billing/checkout — crée un checkout Chargily.
  async createCheckout(args: {
    userId: string;
    plan: PlanId;
    promoCode?: string;
    groupPackId?: string;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ url: string; providerRef: string; finalCents: number }> {
    const plan = args.plan;
    if (!Object.hasOwn(PLAN_PRICING_DA, plan)) {
      throw new BadRequestException(`plan inconnu : ${plan}`);
    }
    // Validate redirects before reserving quota or inserting an order.
    for (const redirect of [args.successUrl, args.cancelUrl]) {
      if (redirect && new URL(redirect).origin !== 'https://medanki.dz')
        throw new BadRequestException('origine de retour non autorisée');
    }
    const [user] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, args.userId));
    if (!user) throw new BadRequestException('utilisateur inconnu');
    const order = await this.db.transaction(async (tx) => {
      let baseCents = PLAN_PRICING_DA[plan] * 100;
      let durationDays = PLAN_DURATION_DAYS[plan];
      let beneficiaries = [args.userId];
      if ((plan === 'group') !== Boolean(args.groupPackId))
        throw new BadRequestException(
          'group_pack_id requis uniquement pour un pack groupe',
        );
      if (args.groupPackId) {
        const [pack] = await tx
          .select()
          .from(groupPacks)
          .where(eq(groupPacks.id, args.groupPackId))
          .for('update');
        if (!pack || pack.coordinatorUserId !== args.userId)
          throw new ForbiddenException('coordinateur requis');
        if (pack.status !== 'full' || pack.expiresAt.getTime() <= Date.now())
          throw new BadRequestException('pack incomplet ou expiré');
        const existing = await tx
          .select()
          .from(paymentOrders)
          .where(
            and(
              eq(paymentOrders.groupPackId, pack.id),
              sql`${paymentOrders.status} IN ('pending', 'paid')`,
            ),
          );
        if (existing.length)
          throw new BadRequestException(
            'paiement du pack déjà engagé ; rapprocher la commande existante',
          );
        beneficiaries = (
          await tx
            .select()
            .from(groupPackMembers)
            .where(eq(groupPackMembers.packId, pack.id))
        ).map((m) => m.userId);
        if (beneficiaries.length !== 5 || !beneficiaries.includes(args.userId))
          throw new BadRequestException('cinq bénéficiaires requis');
        if (!['monthly', 'semester', 'yearly'].includes(pack.plan))
          throw new BadRequestException('plan du pack invalide');
        baseCents = pack.perUserCents * 5;
        durationDays = PLAN_DURATION_DAYS[pack.plan as PlanId];
      }
      let promoCode: string | undefined;
      if (args.promoCode) {
        const quote = await this.promo.resolve(
          { code: args.promoCode, plan, baseCents },
          tx,
        );
        baseCents = quote.finalCents;
        durationDays = quote.durationDays;
        promoCode = quote.code;
      }
      if (
        !Number.isSafeInteger(baseCents) ||
        baseCents <= 0 ||
        baseCents > 2_147_483_600 ||
        baseCents % 100 !== 0 ||
        !Number.isInteger(durationDays) ||
        durationDays <= 0 ||
        durationDays > 3650
      )
        throw new BadRequestException('montant ou durée de paiement invalide');
      const [created] = await tx
        .insert(paymentOrders)
        .values({
          userId: args.userId,
          provider: 'chargily',
          plan,
          amountCents: baseCents,
          durationDays,
          currency: 'DZD',
          contractVersion: 2,
          promoCode: promoCode ?? null,
          groupPackId: args.groupPackId ?? null,
        })
        .returning();
      if (!created) throw new Error('commande non créée');
      await tx
        .insert(paymentOrderBeneficiaries)
        .values(
          beneficiaries.map((userId) => ({ orderId: created.id, userId })),
        );
      return created;
    });
    const baseCents = order.amountCents;
    const durationDays = order.durationDays!;
    try {
      const checkout = await this.chargily.createPayment({
        userId: args.userId,
        userEmail: user.email,
        plan,
        amount_cents: baseCents,
        ...(args.successUrl !== undefined && { successUrl: args.successUrl }),
        ...(args.cancelUrl !== undefined && { cancelUrl: args.cancelUrl }),
        metadata: {
          plan,
          durationDays: String(durationDays),
          order_id: order.id,
        },
      });
      await this.db
        .update(paymentOrders)
        .set({ providerRef: checkout.providerRef, checkoutUrl: checkout.url })
        .where(eq(paymentOrders.id, order.id));
      return {
        url: checkout.url,
        providerRef: checkout.providerRef,
        finalCents: baseCents,
      };
    } catch (error) {
      if (error instanceof CheckoutRejectedError)
        await this.db
          .update(paymentOrders)
          .set({ status: 'failed' })
          .where(eq(paymentOrders.id, order.id));
      // A timeout is not a cancellation: retain the reservation for reconciliation.
      throw new ServiceUnavailableException({
        message: 'checkout non disponible ; rapprocher avant de réessayer',
        order_id: order.id,
      });
    }
  }

  /// POST /v1/billing/webhook/chargily — endpoint public signé.
  /// Le contrôleur a déjà vérifié la signature et passé le rawBody.
  async handleChargilyWebhook(
    args: {
      eventId: string;
      eventType: string;
      payload: unknown;
    },
    reconciliation?: {
      actorUserId: string;
      reason: string;
      orderId: string;
      bindRef?: boolean;
    },
  ): Promise<{ processed: boolean; reason?: string }> {
    // Official webhook samples omit currency. Resolve it from an authenticated GET,
    // never from a local default. This network request occurs outside SQL locks.
    let authoritativePayload = args.payload;
    if (
      args.eventType === 'checkout.paid' &&
      typeof args.payload === 'object' &&
      args.payload !== null
    ) {
      const p = args.payload as Record<string, unknown>;
      if (p.currency === undefined && typeof p.id === 'string')
        authoritativePayload = await this.chargily.retrieveCheckout(p.id);
    }
    return this.db.transaction(async (tx) => {
      if (reconciliation) {
        const [actor] = await tx
          .select()
          .from(users)
          .where(eq(users.id, reconciliation.actorUserId));
        if (!actor || actor.rbacRole !== 'admin')
          throw new ForbiddenException('administrateur courant requis');
        const [target] = await tx
          .select()
          .from(paymentOrders)
          .where(eq(paymentOrders.id, reconciliation.orderId))
          .for('update');
        if (!target || target.contractVersion !== 2)
          throw new BadRequestException(
            'commande historique : expertise manuelle requise',
          );
        const remote = this.chargily.validateCheckout(authoritativePayload);
        if (target.providerRef && target.providerRef !== remote.id)
          throw new BadRequestException('référence contradictoire');
        if (
          !target.providerRef &&
          (!reconciliation.bindRef || remote.metadata?.order_id !== target.id)
        )
          throw new BadRequestException('preuve de liaison manquante');
        if (
          remote.amount * 100 !== target.amountCents ||
          remote.currency !== target.currency
        )
          throw new BadRequestException('contrat incohérent');
        if (!target.providerRef)
          await tx
            .update(paymentOrders)
            .set({ providerRef: remote.id })
            .where(eq(paymentOrders.id, target.id));
        await tx
          .insert(auditLog)
          .values({
            actorUserId: actor.id,
            action: 'billing.reconcile',
            targetType: 'payment_order',
            targetId: target.id,
            metadata: {
              reason: reconciliation.reason,
              providerRef: remote.id,
              status: remote.status,
              amount: remote.amount,
              currency: remote.currency,
            },
          });
      }
      // Claim the event atomically. A concurrent INSERT waits for this
      // transaction; rollback also removes the claim, allowing a safe retry.
      const [claimed] = await tx
        .insert(webhookEvents)
        .values({
          eventId: args.eventId,
          provider: 'chargily',
          eventType: args.eventType,
          payload: args.payload as object,
          processed: false,
        })
        .onConflictDoNothing({
          target: [webhookEvents.eventId, webhookEvents.provider],
        })
        .returning({ id: webhookEvents.id });
      if (!claimed) return { processed: true, reason: 'already_seen' };
      // 3. Délègue au provider pour l'interprétation.
      const result: PaymentResult = await this.chargily.handleWebhook({
        eventId: args.eventId,
        eventType: args.eventType,
        payload: authoritativePayload,
        signature: null, // déjà vérifiée par le contrôleur
      });
      // 4. Si confirmé, on crédite uniquement une commande interne
      // existante. Le metadata du provider n'est pas une source de vérité.
      if (result.confirmed) {
        const parsed = PaidCheckout.safeParse(authoritativePayload);
        if (!parsed.success || parsed.data.id !== result.providerRef) {
          throw new BadRequestException(
            'payload de paiement confirmé invalide',
          );
        }
        const payload = parsed.data;
        // Lock the order before deciding whether to grant anything. Different
        // event IDs for the same checkout must not credit it twice.
        const [order] = await tx
          .select()
          .from(paymentOrders)
          .where(
            and(
              eq(paymentOrders.providerRef, result.providerRef),
              eq(paymentOrders.provider, 'chargily'),
            ),
          )
          .for('update');
        if (!order) {
          // May arrive before createCheckout stores providerRef. Never match
          // on untrusted metadata: rollback and ask the provider to retry.
          throw new ServiceUnavailableException(
            'commande de paiement non rapprochée ; réessayer',
          );
        }
        if (order.contractVersion !== 2)
          throw new ServiceUnavailableException(
            'contrat historique à rapprocher ; aucune conversion implicite',
          );
        if (
          payload.amount * 100 !== order.amountCents ||
          payload.currency !== order.currency
        ) {
          throw new BadRequestException(
            'montant ou devise du webhook différent de la commande',
          );
        }
        if (order.status !== 'paid') {
          if (order.status !== 'pending') {
            throw new BadRequestException('commande non payable');
          }
          if (!order.durationDays) {
            // Legacy orders need reconciliation, not a guessed promo duration.
            throw new ServiceUnavailableException(
              'durée de commande historique à rapprocher',
            );
          }
          if (order.groupPackId)
            await tx
              .select()
              .from(groupPacks)
              .where(eq(groupPacks.id, order.groupPackId))
              .for('update');
          if (order.promoCode)
            await tx
              .select()
              .from(promoCodes)
              .where(eq(promoCodes.code, order.promoCode))
              .for('update');
          const members = await tx
            .select()
            .from(paymentOrderBeneficiaries)
            .where(eq(paymentOrderBeneficiaries.orderId, order.id))
            .orderBy(asc(paymentOrderBeneficiaries.userId));
          if (
            members.length !== (order.plan === 'group' ? 5 : 1) ||
            !members.some((m) => m.userId === order.userId)
          )
            throw new ServiceUnavailableException('bénéficiaires à rapprocher');
          // Sorted locks also serialize intersecting group purchases without deadlocks.
          for (const member of members) {
            const [owner] = await tx
              .select({ id: users.id })
              .from(users)
              .where(eq(users.id, member.userId))
              .for('no key update');
            if (!owner)
              throw new BadRequestException('bénéficiaire introuvable');
            await this.creditEntitlement(tx, {
              userId: member.userId,
              durationDays: order.durationDays,
              providerRef: result.providerRef,
            });
          }
          if (order.promoCode)
            await tx
              .update(promoCodes)
              .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
              .where(eq(promoCodes.code, order.promoCode));
          if (order.groupPackId)
            await tx
              .update(groupPacks)
              .set({ status: 'paid', paymentRef: result.providerRef })
              .where(eq(groupPacks.id, order.groupPackId));
          await tx
            .update(paymentOrders)
            .set({ status: 'paid', paidAt: new Date() })
            .where(eq(paymentOrders.id, order.id));
        }
      }
      // Only a fresh server-to-server observation can release a reservation.
      if (reconciliation && !result.confirmed) {
        const remote = this.chargily.validateCheckout(authoritativePayload);
        if (['failed', 'canceled', 'expired'].includes(remote.status)) {
          await tx
            .update(paymentOrders)
            .set({ status: remote.status })
            .where(
              and(
                eq(paymentOrders.id, reconciliation.orderId),
                eq(paymentOrders.status, 'pending'),
              ),
            );
        }
      }
      // 5. Marque l'event comme traité.
      await tx
        .update(webhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(eq(webhookEvents.id, claimed.id));
      return { processed: true };
    });
  }

  async reconcile(args: {
    actorUserId: string;
    orderId: string;
    providerRef?: string;
    reason: string;
  }) {
    // Check the current DB role before making a provider call (not just the JWT role).
    const [actor] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, args.actorUserId));
    if (!actor || actor.rbacRole !== 'admin')
      throw new ForbiddenException('administrateur requis');
    const [order] = await this.db
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, args.orderId));
    if (!order || order.contractVersion !== 2)
      throw new BadRequestException('commande absente ou historique');
    const ref = order.providerRef ?? args.providerRef;
    if (!ref)
      throw new BadRequestException(
        'référence provider à rechercher dans le tableau Chargily',
      );
    const remote = await this.chargily.retrieveCheckout(ref);
    return this.handleChargilyWebhook(
      {
        eventId: `reconcile:${order.id}:${remote.status}`,
        eventType: `checkout.${remote.status}`,
        payload: remote,
      },
      {
        actorUserId: args.actorUserId,
        orderId: order.id,
        reason: args.reason,
        bindRef: !order.providerRef,
      },
    );
  }

  /// Crédite / renouvelle l'entitlement d'un utilisateur.
  /// Si un entitlement actif existe, on étend à partir de `expiresAt`.
  private async creditEntitlement(
    db: BillingTransaction,
    args: { userId: string; durationDays: number; providerRef: string },
  ): Promise<void> {
    const existing = await db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, args.userId),
          eq(entitlements.plan, 'premium'),
        ),
      )
      .then((rows) => rows[0]);
    const now = new Date();
    const start =
      existing && existing.expiresAt && existing.expiresAt > now
        ? existing.expiresAt
        : now;
    const expires = new Date(start.getTime() + args.durationDays * 86_400_000);
    const grace = new Date(expires.getTime() + this.gracePeriodSeconds * 1000);
    await db
      .insert(entitlements)
      .values({
        userId: args.userId,
        // The commercial SKU stays in payment_orders; the access tier is premium.
        plan: 'premium',
        startsAt: start,
        expiresAt: expires,
        graceUntil: grace,
        paymentProvider: 'chargily',
        paymentRef: args.providerRef,
      })
      .onConflictDoUpdate({
        target: [entitlements.userId, entitlements.plan],
        set: {
          expiresAt: expires,
          graceUntil: grace,
          paymentRef: args.providerRef,
        },
      });
    this.logger.log(
      `entitlement credited: user=${args.userId} plan=premium expires=${expires.toISOString()}`,
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
      .where(
        and(eq(entitlements.userId, userId), eq(entitlements.plan, 'premium')),
      )
      .orderBy(entitlements.expiresAt);
    const now = Date.now();
    // On prend l'entitlement le plus long qui couvre `now`.
    let best: (typeof rows)[number] | undefined;
    for (const r of rows) {
      if (r.expiresAt && r.expiresAt.getTime() > now) {
        if (!best || (best.expiresAt && r.expiresAt > best.expiresAt)) best = r;
      }
    }
    if (!best)
      return { plan: 'free', expiresAtMs: 0, graceUntilMs: 0, isActive: false };
    const graceMs = best.graceUntil ? best.graceUntil.getTime() : 0;
    return {
      plan: (best.plan as 'free' | 'premium' | 'promo') ?? 'free',
      expiresAtMs: best.expiresAt ? best.expiresAt.getTime() : 0,
      graceUntilMs: graceMs,
      isActive: best.expiresAt ? best.expiresAt.getTime() > now : false,
    };
  }
}
