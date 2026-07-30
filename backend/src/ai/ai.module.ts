// AiModule — Phase 18 (intelligence artificielle).
//
// Sous-phases :
//   18.1 hints adaptatifs   (HintsService — règles SRS, sans LLM) ✅
//   18.2 génération LLM     (AiGenerateService — provider-agnostic) ✅
//   18.3 voice-to-card      (VoiceToCardService — STT client ou serveur) ✅
//   18.4 adaptive learning  (AdaptiveService — profils d'erreur + signaux) ✅
//   18.5 décrochage         (RetentionService — FCM/APNs, fenêtre 8h-22h) ✅
//   18.6 voice tutoring     (à venir)
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HintsService } from './hints/hints.service';
import { HintsController } from './hints/hints.controller';
import { LlmProviderFactory } from './llm/llm.factory';
import { AiGenerateService } from './generate/ai-generate.service';
import { AiGenerateController } from './generate/ai-generate.controller';
import { TranscriberFactory } from './voice/transcriber.factory';
import { VoiceToCardService } from './voice/voice-to-card.service';
import { VoiceToCardController } from './voice/voice-to-card.controller';
import { AdaptiveService } from './adaptive/adaptive.service';
import { AdaptiveController } from './adaptive/adaptive.controller';
import { RetentionService } from './retention/retention.service';
import { RetentionController } from './retention/retention.controller';

@Module({
  imports: [NotificationsModule], // Phase 14 : FCM/APNs pour 18.5
  providers: [
    HintsService,
    LlmProviderFactory,
    AiGenerateService,
    TranscriberFactory,
    VoiceToCardService,
    AdaptiveService,
    RetentionService,
  ],
  controllers: [
    HintsController,
    AiGenerateController,
    VoiceToCardController,
    AdaptiveController,
    RetentionController,
  ],
  exports: [
    HintsService,
    AiGenerateService,
    LlmProviderFactory,
    VoiceToCardService,
    TranscriberFactory,
    AdaptiveService,
    RetentionService,
  ],
})
export class AiModule {}
