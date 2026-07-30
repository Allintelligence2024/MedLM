/// Health check — répond 200 OK avec quelques infos système.
import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check() {
    let dbStatus = 'ok';
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch (e) {
      dbStatus = (e as Error).message;
    }
    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      time: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
    };
  }
}
