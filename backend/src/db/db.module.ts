// DbModule — Phase 18.
//
// Expose `ReadReplicaRouter` comme provider injectable. Configuré
// à partir des variables d'environnement (DATABASE_URL primary,
// DATABASE_READ_REPLICA_URLS comma-separated).
import { Global, Module } from '@nestjs/common';
import { ReadReplicaRouter } from './read-replica-router';

@Global()
@Module({
  providers: [
    {
      provide: ReadReplicaRouter,
      useFactory: () => {
        const primary = process.env.DATABASE_URL ?? '';
        const replicas = (process.env.DATABASE_READ_REPLICA_URLS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const lagMs = Number(process.env.READ_REPLICA_LAG_TOLERANCE_MS ?? 30_000);
        return new ReadReplicaRouter({
          primaryUrl: primary,
          replicaUrls: replicas,
          lagToleranceMs: lagMs,
        });
      },
    },
  ],
  exports: [ReadReplicaRouter],
})
export class DbModule {}
