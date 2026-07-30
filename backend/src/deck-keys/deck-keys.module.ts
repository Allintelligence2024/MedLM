import { Module } from '@nestjs/common';
import { DeckKeysService } from './deck-keys.service';
import { DeckKeysController } from './deck-keys.controller';

@Module({
  providers: [DeckKeysService],
  controllers: [DeckKeysController],
  exports: [DeckKeysService],
})
export class DeckKeysModule {}
