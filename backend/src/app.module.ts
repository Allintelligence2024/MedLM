// AppModule — composition root côté serveur (Phase 10/11/12).
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModuleConfigured } from './common/throttle';
import { DatabaseModule } from './db/database.module';
import { FsrsModule } from './common/fsrs/fsrs.module';
import { SrsSyncModule } from './srs-sync/srs-sync.module';
import { ContentModule } from './content/content.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { BillingModule } from './billing/billing.module';
import { EntitlementModule } from './entitlement/entitlement.module';
import { RbacModule } from './rbac/rbac.module';
import { ExamsModule } from './exams/exams.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ObservabilityModule } from './observability/observability.module';
import { GamificationModule } from './gamification/gamification.module';
import { DeckKeysModule } from './deck-keys/deck-keys.module';
import { StatsModule } from './stats/stats.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ShareModule } from './share/share.module';
import { GroupPacksModule } from './group-packs/group-packs.module';
import { TenantsModule } from './tenants/tenants.module';
import { I18nModule } from './i18n/i18n.module';
import { CacheModule } from './cache/cache.module';
import { DbModule } from './db/db.module';
import { AiModule } from './ai/ai.module';
import { GatewayModule } from './gateway/gateway.module';
import { MlModule } from './ml/ml.module';
import { PartnershipsModule } from './partnerships/partnerships.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        level: (process.env.LOG_LEVEL ?? 'info') as
          | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent',
        // pino-pretty = thread-stream (worker thread). Il tue les
        // workers vitest (crash silencieux) et n'a aucun sens hors dev
        // local : on ne l'attache QUE si NODE_ENV est absent (npm run
        // start:dev) ou explicitement 'development'.
        ...(!process.env.NODE_ENV || process.env.NODE_ENV === 'development'
          ? { transport: { target: 'pino-pretty', options: { singleLine: true as const } } }
          : {}),
      },
    }),
    ThrottlerModuleConfigured,
    DatabaseModule,
    FsrsModule,
    RbacModule,
    ObservabilityModule, // Sentry + Prometheus (Phase 12)
    AuthModule,
    HealthModule,
    ContentModule,
    SrsSyncModule,
    BillingModule,
    EntitlementModule,
    ExamsModule, // Phase 10
    NotificationsModule, // Phase 10 (FCM)
    GamificationModule, // Phase 9 bis (leaderboard)
    DeckKeysModule, // Phase 14 (RSA-OAEP key exchange)
    StatsModule, // Phase 15.2 (statistiques utilisateur)
    OnboardingModule, // Phase 15.3 (onboarding adaptatif)
    ShareModule, // Phase 15.5 (partage social)
    GroupPacksModule, // Phase 16.3 (pack groupe)
    TenantsModule, // Phase 16.4 (B2B multi-tenants)
    I18nModule, // Phase 17.5 (internationalisation FR/AR/EN)
    CacheModule, // Phase 18 (Redis cache injectable)
    DbModule, // Phase 18 (read replicas)
    AiModule, // Phase 18.1+ (hints adaptatifs, génération LLM, tutorat)
    GatewayModule, // Phase 20.2 (passerelle GraphQL, opérations persistées)
    MlModule, // Phase 20.3 (prédiction examen blanc + focus par tag, local)
    PartnershipsModule, // Phase 20.4 (partenariats facultés DZ)
  ],
})
export class AppModule {}
