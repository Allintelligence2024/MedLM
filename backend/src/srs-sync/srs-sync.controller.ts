/// Contrôleur REST du module SRS Sync.
///
/// Trois endpoints :
///   * POST /srs-sync/push   — idempotent, batch 100 max
///   * GET  /srs-sync/pull?since_ms=&limit=  — paginé
///   * GET  /srs-sync/state?card_id=         — état courant
///
/// L'authentification est supposée faite par un middleware en amont
/// (Phase 5 = Auth). Pour l'instant, on accepte un `user_id` en header
/// `X-User-Id` en mode dev. Phase 6 câblera JWT.
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { PullQuery, PushBody } from './srs-sync.dto';
import { SrsSyncService } from './srs-sync.service';

@Controller('srs-sync')
export class SrsSyncController {
  constructor(private readonly service: SrsSyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async push(
    @Headers('X-User-Id') userId: string,
    @Headers('X-Device-Id') deviceId: string,
    @Body() body: unknown,
  ) {
    if (!userId) throw new Error('X-User-Id header manquant');
    if (!deviceId) throw new Error('X-Device-Id header manquant');
    const events = PushBody.parse(body).events;
    return this.service.push({ userId, deviceId, events });
  }

  @Get('pull')
  async pull(
    @Headers('X-User-Id') userId: string,
    @Headers('X-Device-Id') deviceId: string,
    @Query() query: unknown,
  ) {
    if (!userId) throw new Error('X-User-Id header manquant');
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
