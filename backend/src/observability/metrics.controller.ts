// MetricsController — endpoint Prometheus (scrape par Prometheus).
//
// Pas d'auth : ce service est destiné à être exposé uniquement sur
// un réseau interne (ou via un sidecar). En prod on le protège
// par IP allow-list au niveau du reverse proxy.
import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  scrape(): string {
    return this.metrics.toPrometheus();
  }
}
