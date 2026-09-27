// BillingController — endpoints REST + webhooks.
//
// Endpoints :
//   POST /v1/billing/checkout       — auth JWT
//   GET  /v1/billing/entitlement    — auth JWT
//   POST /v1/billing/webhook/chargily — public, signé HMAC
import {
  Body,
  ForbiddenException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { RbacGuard, RequireRole } from '../rbac/rbac.guard';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { CreateCheckoutBody, ChargilyWebhookEvent } from './billing.dto';
import { ChargilyPayProvider } from './chargily.provider';
import { CurrentUserId } from '../auth/jwt.decorators';
import { JwtGuard } from '../auth/jwt.guard';
import { UseGuards } from '@nestjs/common';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly service: BillingService,
    private readonly chargily: ChargilyPayProvider,
  ) {}

  @Post('checkout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  async checkout(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = CreateCheckoutBody.parse(body);
    return this.service.createCheckout({
      userId,
      plan: b.plan,
      ...(b.promo_code !== undefined && { promoCode: b.promo_code }),
      ...(b.group_pack_id !== undefined && { groupPackId: b.group_pack_id }),
      ...(b.success_url !== undefined && { successUrl: b.success_url }),
      ...(b.cancel_url !== undefined && { cancelUrl: b.cancel_url }),
    });
  }

  @Post('reconcile')
  @UseGuards(JwtGuard, RbacGuard)
  @RequireRole('admin')
  async reconcile(@CurrentUserId() actorUserId: string, @Body() body: unknown) {
    const b = z
      .object({
        order_id: z.string().uuid(),
        provider_ref: z.string().min(1).max(255).optional(),
        reason: z.string().trim().min(10).max(1000),
      })
      .parse(body);
    return this.service.reconcile({
      actorUserId,
      orderId: b.order_id,
      reason: b.reason,
      ...(b.provider_ref !== undefined && { providerRef: b.provider_ref }),
    });
  }

  @Get('entitlement')
  @UseGuards(JwtGuard)
  async entitlement(@CurrentUserId() userId: string) {
    return this.service.currentEntitlement(userId);
  }

  /// Webhook Chargily : on vérifie la signature avec le raw body.
  @Post('webhook/chargily')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: Request,
    @Headers('signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!raw) throw new ForbiddenException('raw body requis');
    const rawStr = raw.toString('utf8');
    if (!this.chargily.verifyWebhookSignature(rawStr, signature ?? null)) {
      throw new ForbiddenException('bad_signature');
    }
    const evt = ChargilyWebhookEvent.parse(body);
    return this.service.handleChargilyWebhook({
      eventId: evt.id,
      eventType: evt.type,
      payload: evt.data,
    });
  }
}
