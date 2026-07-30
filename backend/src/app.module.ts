// AppModule — composition root côté serveur (Phase 7).
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        // On NE loggue jamais les Authorization headers ni les cookies.
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
    AuthModule,
    HealthModule,
    ContentModule,
    SrsSyncModule,
    BillingModule,
    EntitlementModule,
  ],
})
export class AppModule {}
