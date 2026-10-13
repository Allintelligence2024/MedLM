import { Module } from '@nestjs/common';
import { DeckKeysService } from './deck-keys.service';
import { DeckKeysController } from './deck-keys.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  providers: [DeckKeysService],
  controllers: [DeckKeysController],
  exports: [DeckKeysService],
})
export class DeckKeysModule {}
