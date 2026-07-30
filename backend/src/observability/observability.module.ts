// ObservabilityModule — Sentry, Prometheus, OpenTelemetry (Phase 12 + 12 bis + 14).
import { Global, Module } from '@nestjs/common';
import { SentryService } from './sentry.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { TracingService } from './tracing.service';
import { OtelExporter } from './otel.exporter';

@Global()
@Module({
  providers: [SentryService, MetricsService, TracingService, OtelExporter],
  controllers: [MetricsController],
  exports: [SentryService, MetricsService, TracingService, OtelExporter],
})
export class ObservabilityModule {}
