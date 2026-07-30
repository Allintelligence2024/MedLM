/// AppModule — composition root côté serveur.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './db/database.module';
import { FsrsModule } from './common/fsrs/fsrs.module';
import { SrsSyncModule } from './srs-sync/srs-sync.module';
import { ContentModule } from './content/content.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

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
    DatabaseModule,
    FsrsModule,
    AuthModule,
    HealthModule,
    ContentModule,
    SrsSyncModule,
  ],
})
export class AppModule {}
