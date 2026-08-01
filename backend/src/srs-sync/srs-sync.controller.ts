/// Contrôleur REST du module SRS Sync — version Phase 6.
///
/// Endpoints protégés par JwtGuard. L'identité est extraite du token, plus
/// des headers `X-User-Id`. Le `deviceId` est passé en header
/// `X-Device-Id` (émis par l'app à l'inscription et stocké côté client).
///
/// Trois endpoints :
///   * POST /srs-sync/push   — idempotent, batch 100 max
///   * GET  /srs-sync/pull?since_ms=&limit=  — paginé
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { PullQuery, PushBody } from './srs-sync.dto';
import { SrsSyncService } from './srs-sync.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('srs-sync')
@UseGuards(JwtGuard)
export class SrsSyncController {
  constructor(private readonly service: SrsSyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async push(
    @CurrentUserId() userId: string,
    @Headers('X-Device-Id') deviceId: string,
    @Body() body: unknown,
  ) {
    if (!deviceId) throw new Error('X-Device-Id header manquant');
    const events = PushBody.parse(body).events;
    return this.service.push({ userId, deviceId, events });
  }

  @Get('pull')
  async pull(
    @CurrentUserId() userId: string,
    @Headers('X-Device-Id') deviceId: string,
    @Query() query: unknown,
  ) {
    if (!deviceId) throw new Error('X-Device-Id header manquant');
    const q = PullQuery.parse(query);
    return this.service.pull({
      userId,
      deviceId,
      sinceMs: q.since_ms,
      limit: q.limit,
    });
  }
}
