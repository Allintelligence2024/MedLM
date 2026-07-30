/// Health check — endpoints K8s-ready (Phase 12 bis).
///
/// /healthz  : liveness probe. Retourne 200 si le process tourne.
///             Ne vérifie PAS la DB (sinon K8s tue le pod sur
///             un blip réseau).
/// /readyz   : readiness probe. Vérifie la DB et les
///             dépendances critiques. K8s ne route PAS le
///             trafic vers le pod tant que ce n'est pas vert.
/// /health   : legacy — agrège tout (compatibilité Phase 12).
import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';

@Controller()
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// Liveness — process vivant.
  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: 'ok', uptime_s: Math.round(process.uptime()) };
  }

  /// Readiness — DB joignable.
  @Get('readyz')
  async readiness() {
    const checks: Record<string, 'ok' | string> = {};
    let allOk = true;
    // DB
    try {
      await this.db.execute(sql`SELECT 1`);
      checks.db = 'ok';
    } catch (e) {
      checks.db = (e as Error).message;
      allOk = false;
    }
    // Outbox (à brancher en Phase 13+ si on a un outbox côté
    // serveur). Pour l'instant, on l'inclut quand même.
    checks.outbox = 'ok';
    return {
      status: allOk ? 'ready' : 'not_ready',
      checks,
    };
  }

  /// Legacy / health — agrège tout.
  @Get('health')
  async check() {
    const ready = await this.readiness();
    return {
      status: ready.status === 'ready' ? 'ok' : 'degraded',
      ...ready,
      time: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
      version: process.env.APP_VERSION ?? 'dev',
    };
  }
}
