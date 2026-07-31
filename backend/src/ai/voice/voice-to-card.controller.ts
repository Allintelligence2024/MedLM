// VoiceToCardController — Phase 18.3.
//
// POST /v1/ai/voice-to-card
// Ouvert à tout utilisateur authentifié (étudiant compris) : la dictée
// n'atterrit que dans SA file de brouillons, relue par un auteur avant
// publication. Throttle IP 20 req/min — une dictée est un acte lent.
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VoiceToCardService } from './voice-to-card.service';
import { VoiceToCardBody } from './voice-to-card.dto';
import { JwtGuard } from '../../auth/jwt.guard';
import { CurrentUserId } from '../../auth/jwt.decorators';

@Controller('ai/voice-to-card')
@UseGuards(JwtGuard)
export class VoiceToCardController {
  constructor(private readonly service: VoiceToCardService) {}

  @Post()
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  async submit(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = VoiceToCardBody.parse(body);
    return this.service.submit({ userId, body: b });
  }
}
