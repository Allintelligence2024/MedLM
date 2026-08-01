import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { EntitlementService } from './entitlement.service';
import { EntitlementController } from './entitlement.controller';

@Module({
  // EntitlementService injecte BillingService (statut d'abonnement)
  // — sans cet import, Nest ne peut pas résoudre la dépendance et
  // l'application ne boote pas.
  imports: [BillingModule],
  providers: [EntitlementService],
  controllers: [EntitlementController],
  exports: [EntitlementService],
})
export class EntitlementModule {}
