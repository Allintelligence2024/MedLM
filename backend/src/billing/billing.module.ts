// BillingModule — wires Chargily + Promo + Service.
import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { ChargilyPayProvider } from './chargily.provider';
import { PromoCodeProvider } from './promo-code.provider';

@Module({
  providers: [BillingService, ChargilyPayProvider, PromoCodeProvider],
  controllers: [BillingController],
  exports: [BillingService, ChargilyPayProvider, PromoCodeProvider],
})
export class BillingModule {}
