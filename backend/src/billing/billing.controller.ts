// BillingController — endpoints REST + webhooks.
//
// Endpoints :
//   POST /v1/billing/checkout       — auth JWT
//   GET  /v1/billing/entitlement    — auth JWT
//   POST /v1/billing/webhook/chargily — public, signé HMAC
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBody,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
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
  async checkout(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('origin') origin?: string,
  ) {
    const b = CreateCheckoutBody.parse(body);
    return this.service.createCheckout({
      userId,
      plan: b.plan,
      promoCode: b.promo_code,
      successUrl: b.success_url ?? `${origin ?? 'https://medanki.dz'}/billing/success`,
      cancelUrl: b.cancel_url ?? `${origin ?? 'https://medanki.dz'}/billing/cancel`,
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
    const rawStr = raw ? raw.toString('utf8') : JSON.stringify(body);
    if (!this.chargily.verifyWebhookSignature(rawStr, signature ?? null)) {
      return { processed: false, reason: 'bad_signature' };
    }
    const evt = ChargilyWebhookEvent.parse(body);
    return this.service.handleChargilyWebhook({
      eventId: evt.id,
      eventType: evt.type,
      payload: evt.data,
    });
  }
}
