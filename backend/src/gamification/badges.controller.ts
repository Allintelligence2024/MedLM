// BadgesController — endpoints REST pour la collection de badges.
import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { badgeUnlocks } from '../db/schema/gamification';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUserId } from '../auth/jwt.decorators';

@Controller('gamification/badges')
@UseGuards(JwtGuard)
export class BadgesController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// GET /v1/gamification/badges — badges débloqués par
  /// l'utilisateur courant, triés par date de déblocage décroissante.
  @Get()
  async list(@CurrentUserId() userId: string) {
    const rows = await this.db
      .select()
      .from(badgeUnlocks)
      .where(eq(badgeUnlocks.userId, userId))
      .orderBy(desc(badgeUnlocks.unlockedAt));
    return {
      items: rows.map((r) => ({
        badge_id: r.badgeId,
        unlocked_at: r.unlockedAt.toISOString(),
        context: r.context,
      })),
    };
  }
}
