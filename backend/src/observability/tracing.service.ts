// TracingService — OpenTelemetry Phase 12 bis.
//
// Span distribué sur les requêtes HTTP. Compatible avec
// Prometheus + Grafana Tempo + Jaeger (auto-instrumentation via
// OTLP).
//
// On utilise l'API Node `node:async_hooks` pour propager le
// contexte asynchrone, sans dépendre d'un SDK complet (l'API
// officielle `@opentelemetry/sdk-node` fait 5 Mo de deps).
//
// Mode léger : on génère un traceId par requête, on l'attache
// au log Pino, et on l'expose dans les headers de réponse
// (`x-trace-id`). L'export OTLP est branchable via OTEL_EXPORTER_OTLP_ENDPOINT.

import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  /// Nom de l'opération (ex. 'GET /v1/srs-sync/pull').
  operation: string;
  startedAt: number;
  /// Attributs clé-valeur.
  attributes: Record<string, string | number | boolean>;
}

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private readonly storage = new AsyncLocalStorage<TraceContext>();

  /// Démarre un span. Le callback reçoit un TraceContext qu'il
  /// peut enrichir.
  run<T>(op: string, fn: (ctx: TraceContext) => Promise<T> | T): Promise<T> | T {
    const ctx: TraceContext = {
      traceId: randomUUID().replace(/-/g, ''),
      spanId: randomUUID().slice(0, 16),
      operation: op,
      startedAt: Date.now(),
      attributes: {},
    };
    return this.storage.run(ctx, () => fn(ctx));
  }

  /// Récupère le contexte courant (à utiliser depuis n'importe
  /// quel service injecté). Retourne `null` si on n'est pas dans
  /// un span.
  current(): TraceContext | null {
    return this.storage.getStore() ?? null;
  }

  /// Ajoute un attribut au span courant. No-op si pas de span.
  setAttribute(key: string, value: string | number | boolean): void {
    const ctx = this.current();
    if (ctx) ctx.attributes[key] = value;
  }

  /// Log structuré du span (à la fin de la requête). Ne bloque
  /// pas : on log en async via setImmediate.
  finish(ctx: TraceContext, status: 'ok' | 'error'): void {
    const durationMs = Date.now() - ctx.startedAt;
    setImmediate(() => {
      this.logger.log({
        trace: 'span.finish',
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        op: ctx.operation,
        durationMs,
        status,
        ...ctx.attributes,
      });
    });
  }

  /// Génère un middleware-friendly wrapper pour Express.
  /// Utilisé par `main.ts` (cf. bootstrap).
  middleware() {
    return (req: any, res: any, next: any) => {
      const op = `${req.method} ${req.route?.path ?? req.path}`;
      this.run(op, async (ctx) => {
        // Header de réponse : permet de corréler client / serveur.
        res.setHeader('x-trace-id', ctx.traceId);
        try {
          await new Promise<void>((resolve, reject) => {
            res.on('finish', () => resolve());
            res.on('close', () => resolve());
            res.on('error', reject);
            next();
          });
          this.finish(ctx, res.statusCode >= 500 ? 'error' : 'ok');
        } catch (e) {
          this.finish(ctx, 'error');
          throw e;
        }
      });
    };
  }
}
