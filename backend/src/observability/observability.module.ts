import { Global, Module } from '@nestjs/common';
import { SentryService } from './sentry.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  providers: [SentryService, MetricsService],
  controllers: [MetricsController],
  exports: [SentryService, MetricsService],
})
export class ObservabilityModule {}
