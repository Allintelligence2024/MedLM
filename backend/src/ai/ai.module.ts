// AiModule — Phase 18 (intelligence artificielle).
//
// Sous-phases :
//   18.1 hints adaptatifs   (HintsService — règles SRS, sans LLM) ✅
//   18.2 génération LLM     (AiGenerateService — provider-agnostic) ✅
//   18.3 voice-to-card      (VoiceToCardService — STT client ou serveur) ✅
//   18.4 adaptive learning  (à venir)
//   18.5 décrochage         (à venir)
//   18.6 voice tutoring     (à venir)
import { Module } from '@nestjs/common';
import { HintsService } from './hints/hints.service';
import { HintsController } from './hints/hints.controller';
import { LlmProviderFactory } from './llm/llm.factory';
import { AiGenerateService } from './generate/ai-generate.service';
import { AiGenerateController } from './generate/ai-generate.controller';
import { TranscriberFactory } from './voice/transcriber.factory';
import { VoiceToCardService } from './voice/voice-to-card.service';
import { VoiceToCardController } from './voice/voice-to-card.controller';

@Module({
  providers: [
    HintsService,
    LlmProviderFactory,
    AiGenerateService,
    TranscriberFactory,
    VoiceToCardService,
  ],
  controllers: [HintsController, AiGenerateController, VoiceToCardController],
  exports: [
    HintsService,
    AiGenerateService,
    LlmProviderFactory,
    VoiceToCardService,
    TranscriberFactory,
  ],
})
export class AiModule {}
