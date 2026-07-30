/// Module Database — fournisseur Drizzle pour NestJS.
///
/// Le client PostgreSQL (node-postgres) et le `drizzle` wrapper sont
/// instanciés une seule fois par process, et partagés entre tous les
/// modules. La pool est configurée pour ~50 connexions simultanées,
/// suffisant pour la phase MVP (< 50k MAU).
import { Global, Module, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

export type Database = NodePgDatabase<typeof schema>;

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
  ],
  exports: [DRIZZLE, PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
