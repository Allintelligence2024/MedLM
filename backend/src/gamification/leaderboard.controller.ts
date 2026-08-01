// LeaderboardController — endpoints REST.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardQuery, OptInBody } from './leaderboard.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('gamification/leaderboard')
@UseGuards(JwtGuard)
export class LeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  /// POST /v1/gamification/leaderboard/opt-in — enregistre le
  /// pseudonyme et le consentement.
  @Post('opt-in')
  @HttpCode(HttpStatus.CREATED)
  async optIn(@CurrentUserId() userId: string, @Body() body: unknown) {
    const b = OptInBody.parse(body);
    return this.service.optIn(userId, b);
  }

  /// DELETE /v1/gamification/leaderboard/opt-in — révoque le
  /// consentement (RGPD).
  @Delete('opt-in')
  @HttpCode(HttpStatus.NO_CONTENT)
  async optOut(@CurrentUserId() userId: string) {
    await this.service.optOut(userId);
  }

  /// GET /v1/gamification/leaderboard — top N de la semaine.
  @Get()
  async top(@CurrentUserId() userId: string, @Query() query: unknown) {
    const q = LeaderboardQuery.parse(query);
    return this.service.top({
      userId,
      weekIso: this.service.currentWeek(),
      ...(q.faculty !== undefined && { faculty: q.faculty }),
      ...(q.study_year !== undefined && { studyYear: q.study_year }),
      limit: q.limit,
    });
  }

  /// GET /v1/gamification/leaderboard/me — état d'opt-in.
  @Get('me')
  async me(@CurrentUserId() userId: string) {
    return { opt_in: await this.service.isOptIn(userId) };
  }
}
