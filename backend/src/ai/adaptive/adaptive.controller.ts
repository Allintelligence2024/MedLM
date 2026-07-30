// AdaptiveController — Phase 18.4.
//
// GET  /v1/ai/adaptive/profile        — profil d'erreur + FSRS ajusté (user)
// GET  /v1/ai/adaptive/signals        — signaux ouverts (rôle author+)
// POST /v1/ai/adaptive/signals/scan   — balayage global (rôle editor+)
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdaptiveService } from './adaptive.service';
import { SignalsListQuery, SignalsScanBody } from './adaptive.dto';
import { JwtGuard } from '../../auth/jwt.guard';
import { CurrentUserId } from '../../auth/jwt.decorators';
import { RbacGuard, RequireRole } from '../../rbac/rbac.guard';

@Controller('ai/adaptive')
@UseGuards(JwtGuard, RbacGuard)
export class AdaptiveController {
  constructor(private readonly service: AdaptiveService) {}

  @Get('profile')
  async profile(@CurrentUserId() userId: string) {
    return this.service.getProfile({ userId });
  }

  @Get('signals')
  @RequireRole('author')
  async listSignals(@Query() query: unknown) {
    const q = SignalsListQuery.parse(query);
    return this.service.listSignals({ status: q.status, limit: q.limit });
  }

  @Post('signals/scan')
  @RequireRole('editor')
  async scan(@Body() body: unknown) {
    const b = SignalsScanBody.parse(body ?? {});
    return this.service.runScan({
      minLapsesPerUser: b.min_lapses_per_user,
      minAffectedUsers: b.min_affected_users,
      windowDays: b.window_days,
    });
  }
}
