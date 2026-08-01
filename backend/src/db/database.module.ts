/// Module Database — fournisseur Drizzle pour NestJS.
///
/// Le client PostgreSQL (node-postgres) et le `drizzle` wrapper sont
/// instanciés une seule fois par process, et partagés entre tous les
/// modules. La pool est configurée pour ~50 connexions simultanées,
/// suffisant pour la phase MVP (< 50k MAU).
///
/// Lectures répliquées : si `DATABASE_READ_URL` (ou la première URL
/// de `DATABASE_READ_REPLICA_URLS`) est configurée, une seconde pool
/// dédiée alimente le provider `DRIZZLE_READ` — les services « lourds
/// en lecture » (stats, leaderboard, ML) peuvent l'injecter. Sinon
/// `DRIZZLE_READ` retombe sur la pool primary : comportement inchangé
/// par défaut (déploiement mono-instance, cf. Phase 17.2 / 20.1).
import { Global, Module, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const DRIZZLE_READ = Symbol('DRIZZLE_READ');
export const PG_POOL = Symbol('PG_POOL');
export const PG_READ_POOL = Symbol('PG_READ_POOL');

export type Database = NodePgDatabase<typeof schema>;

/// URL de connexion du réplica de lecture (pure, testable).
///
/// Priorité : `DATABASE_READ_URL` (URL unique explicite) > première
/// entrée de `DATABASE_READ_REPLICA_URLS` (liste comma-separated,
/// cf. ReadReplicaRouter) > null (absent → fallback primary).
export function resolveReadUrl(
  env: Partial<{
    DATABASE_READ_URL: string | undefined;
    DATABASE_READ_REPLICA_URLS: string | undefined;
  }>,
): string | null {
  const single = env.DATABASE_READ_URL?.trim();
  if (single) return single;
  const list = (env.DATABASE_READ_REPLICA_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list[0] ?? null;
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('Database');
        const url = config.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error('DATABASE_URL manquante — vérifier .env');
        }
        const schemaName = config.get<string>('PG_SCHEMA') ?? 'public';
        const pool = new Pool({
          connectionString: url,
          max: 50,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => logger.error('pg pool error', err));
        // Pour les tests d'intégration, on isole chaque run dans un schéma
        // PostgreSQL jetable (cf. workflow `backend-ci.yml`).
        if (schemaName !== 'public') {
          pool.on('connect', (client) => {
            client.query(`SET search_path TO "${schemaName}"`).catch((err) => {
              logger.error(`impossible de basculer vers ${schemaName}`, err);
            });
          });
        }
        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    {
      // Pool de lecture dédiée — null quand aucun réplica n'est
      // configuré (le provider DRIZZLE_READ retombe alors sur la
      // pool primary, zéro différence de comportement).
      provide: PG_READ_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool | null => {
        const logger = new Logger('DatabaseRead');
        const url = resolveReadUrl({
          DATABASE_READ_URL: config.get<string>('DATABASE_READ_URL'),
          DATABASE_READ_REPLICA_URLS: config.get<string>(
            'DATABASE_READ_REPLICA_URLS',
          ),
        });
        if (!url) return null;
        const schemaName = config.get<string>('PG_SCHEMA') ?? 'public';
        const pool = new Pool({
          connectionString: url,
          max: 25, // lectures : dimension moitié de la primary (MVP)
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => logger.error('pg read pool error', err));
        if (schemaName !== 'public') {
          pool.on('connect', (client) => {
            client.query(`SET search_path TO "${schemaName}"`).catch((err) => {
              logger.error(`impossible de basculer vers ${schemaName}`, err);
            });
          });
        }
        return pool;
      },
    },
    {
      provide: DRIZZLE_READ,
      inject: [DRIZZLE, PG_READ_POOL],
      useFactory: (primary: Database, readPool: Pool | null): Database =>
        readPool ? drizzle(readPool, { schema }) : primary,
    },
  ],
  exports: [DRIZZLE, DRIZZLE_READ, PG_POOL, PG_READ_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PG_READ_POOL) private readonly readPool: Pool | null,
  ) {}

  async onModuleDestroy(): Promise<void> {
    // readPool === pool est impossible (fallback porté par DRIZZLE_READ,
    // pas par PG_READ_POOL) — pas de double-end.
    await this.pool.end();
    await this.readPool?.end();
  }
}
