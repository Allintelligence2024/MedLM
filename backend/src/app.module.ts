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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
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
  ],
})
export class AppModule {}
