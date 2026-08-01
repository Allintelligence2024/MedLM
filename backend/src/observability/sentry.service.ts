// SentryService — wrapper minimal sur @sentry/node.
//
// On n'active Sentry que si SENTRY_DSN est défini. En dev/test,
// c'est un no-op. Les erreurs capturées sont également envoyées à
// Pino (qui les logge déjà structurées), donc on a deux niveaux de
// observabilité : local (logs) et distant (Sentry).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryService {
  private readonly logger = new Logger(SentryService.name);
  private enabled = false;

  constructor(config: ConfigService) {
    const dsn = config.get<string>('SENTRY_DSN');
    const env = config.get<string>('NODE_ENV') ?? 'development';
    if (dsn) {
      Sentry.init({
        dsn,
        environment: env,
        tracesSampleRate: env === 'production' ? 0.1 : 1.0,
        // On NE capture PAS le contenu des requêtes : PII
        // (Authorization header, etc.).
        beforeSendTransaction(event) {
          if (event.request?.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
          }
          return event;
        },
      });
      this.enabled = true;
      this.logger.log('Sentry initialisé');
    } else {
      this.logger.warn('SENTRY_DSN absent — monitoring distant désactivé');
    }
  }

  captureException(err: unknown, context?: Record<string, unknown>): void {
    if (this.enabled) {
      Sentry.captureException(
        err,
        context === undefined ? undefined : { extra: context },
      );
    }
    // Toujours logger côté Pino.
    this.logger.error(
      `exception: ${(err as Error)?.message ?? err}`,
      err instanceof Error ? err.stack : undefined,
    );
  }

  captureMessage(msg: string, level: 'info' | 'warning' = 'info'): void {
    if (this.enabled) Sentry.captureMessage(msg, level);
    this.logger.log(msg);
  }
}
