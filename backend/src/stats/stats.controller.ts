// StatsController — endpoint REST des statistiques utilisateur.
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsQuery } from './stats.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('stats')
@UseGuards(JwtGuard)
export class StatsController {
  constructor(private readonly service: StatsService) {}

  /// GET /v1/stats/me?period=day|week|month|all
  @Get('me')
  async me(@CurrentUserId() userId: string, @Query() query: unknown) {
    const q = StatsQuery.parse(query);
    return this.service.compute({ userId, period: q.period });
  }
}
