// ObservabilityModule — Sentry, Prometheus, OpenTelemetry (Phase 12 + 12 bis).
import { Global, Module } from '@nestjs/common';
import { SentryService } from './sentry.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { TracingService } from './tracing.service';

@Global()
@Module({
  providers: [SentryService, MetricsService, TracingService],
  controllers: [MetricsController],
  exports: [SentryService, MetricsService, TracingService],
})
export class ObservabilityModule {}
