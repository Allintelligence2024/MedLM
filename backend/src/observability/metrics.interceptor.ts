// HttpMetricsInterceptor — mesure latence + erreurs par route.
//
// S'appuie sur le système de NestJS pour calculer le temps écoulé
// entre l'arrivée et la sortie. Les métriques sont stockées dans
// `MetricsService` (singleton) et exposées par /v1/metrics.
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ method: string; originalUrl?: string; url: string }>();
    const res = http.getResponse<{ statusCode: number }>();
    const route = `${req.method} ${this._route(req)}`;
    const t0 = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          this.metrics.recordLatency(route, Date.now() - t0);
          if (res.statusCode >= 500) this.metrics.recordHttpError(route);
        },
        error: () => {
          this.metrics.recordLatency(route, Date.now() - t0);
          this.metrics.recordHttpError(route);
        },
      }),
    );
  }

  private _route(req: { originalUrl?: string; url: string }): string {
    // Strip query string + IDs pour ne pas exploser la cardinalité.
    const path = (req.originalUrl ?? req.url).split('?')[0]!;
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:n');
  }
}
