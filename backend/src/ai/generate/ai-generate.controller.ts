// AiGenerateController — Phase 18.2.
//
// POST /v1/content/ai-generate
// Réservé aux rôles ≥ author (instructeurs). Rate limiting strict :
// le throttler IP (10 req/min) vient s'ajouter au quota journalier
// par utilisateur (service).
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiGenerateService } from './ai-generate.service';
import { AiGenerateBody } from './ai-generate.dto';
import { JwtGuard } from '../../auth/jwt.guard';
import { CurrentUserId } from '../../auth/jwt.decorators';
import { RbacGuard, RequireRole } from '../../rbac/rbac.guard';

@Controller('content')
@UseGuards(JwtGuard, RbacGuard)
export class AiGenerateController {
  constructor(private readonly service: AiGenerateService) {}

  @Post('ai-generate')
  @RequireRole('author')
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  async generate(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = AiGenerateBody.parse(body);
    return this.service.generate({ userId, body: b });
  }
}
