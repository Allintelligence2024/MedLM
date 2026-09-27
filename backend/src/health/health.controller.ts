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
import { RedisCache } from '../cache/redis-cache';
import {
  parseRegion,
  routingFor,
  REGION_ENV_VAR,
} from '../common/regions/regions';

@Controller()
export class HealthController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cache: RedisCache,
  ) {}

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
    checks.outbox = 'ok';
    // Redis : liveness ne le vérifie pas. Readiness : fail-closed
    // refuse le trafic ; fail-open (défaut) reste ready (budget local).
    if (!process.env.REDIS_URL) {
      checks.redis = 'memory';
    } else if (this.cache.isConnected()) {
      checks.redis = 'ok';
    } else {
      checks.redis = 'down';
      if (process.env.GATEWAY_BUDGET_ON_REDIS_ERROR === 'fail-closed') {
        allOk = false;
      }
    }
    return {
      status: allOk ? 'ready' : 'not_ready',
      checks,
    };
  }

  /// /regionz — Phase 20.1 : région du pod + routage (debug LB/GeoDNS,
  /// non sensible : un identifiant de site, jamais de secret).
  @Get('regionz')
  @HttpCode(HttpStatus.OK)
  region() {
    const def = parseRegion(process.env[REGION_ENV_VAR]);
    return {
      ...routingFor(def.id),
      timezone: def.timezone,
      latency_target_ms: def.latencyTargetMs,
    };
  }

  /// Legacy / health — agrège tout.
  @Get('health')
  async check() {
    const ready = await this.readiness();
    return {
      ...ready,
      status: ready.status === 'ready' ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
      version: process.env.APP_VERSION ?? 'dev',
    };
  }
}
