// TutorController — Phase 18.6.
//
// POST /v1/ai/tutor/ask — ouvert à tout utilisateur authentifié.
// Throttle IP 10 req/min + quota journalier (service) — le chatbot
// reste un outil de révision, pas une boucle de chat gratuite.
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TutorService } from './tutor.service';
import { TutorAskBody } from './tutor.dto';
import { JwtGuard } from '../../auth/jwt.guard';
import { CurrentUserId } from '../../auth/jwt.decorators';

@Controller('ai/tutor')
@UseGuards(JwtGuard)
export class TutorController {
  constructor(private readonly service: TutorService) {}

  @Post('ask')
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  async ask(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = TutorAskBody.parse(body);
    return this.service.ask({ userId, body: b });
  }
}
