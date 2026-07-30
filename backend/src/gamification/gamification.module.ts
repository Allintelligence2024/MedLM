// Module gamification (Phase 9 bis).
import { Module } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { BadgesController } from './badges.controller';

@Module({
  providers: [LeaderboardService],
  controllers: [LeaderboardController, BadgesController],
  exports: [LeaderboardService],
})
export class GamificationModule {}
