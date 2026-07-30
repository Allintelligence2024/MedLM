// AiModule — Phase 18 (intelligence artificielle).
//
// Sous-phases :
//   18.1 hints adaptatifs  (HintsService — règles SRS, sans LLM)
//   18.2 génération LLM    (à venir — provider-agnostic)
//   18.3 voice-to-card     (à venir)
//   18.4 adaptive learning (à venir)
//   18.5 décrochage        (à venir)
//   18.6 voice tutoring    (à venir)
import { Module } from '@nestjs/common';
import { HintsService } from './hints/hints.service';
import { HintsController } from './hints/hints.controller';

@Module({
  providers: [HintsService],
  controllers: [HintsController],
  exports: [HintsService],
})
export class AiModule {}
