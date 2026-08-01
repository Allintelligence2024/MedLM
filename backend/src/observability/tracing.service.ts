// TracingService — Phase 12 bis + Phase 14.
//
// Span distribué sur les requêtes HTTP. Compatible avec
// Prometheus + Grafana Tempo + Jaeger (auto-instrumentation via
// OTLP).
//
// Phase 14 : export OTLP via OtelExporter (léger, sans SDK
// @opentelemetry complet).
//
// On utilise l'API Node `node:async_hooks` pour propager le
// contexte asynchrone, sans dépendre d'un SDK complet.

import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { OtelExporter } from './otel.exporter';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startedAt: number;
  attributes: Record<string, string | number | boolean>;
}

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private readonly storage = new AsyncLocalStorage<TraceContext>();

  constructor(private readonly exporter: OtelExporter) {}

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

  current(): TraceContext | null {
    return this.storage.getStore() ?? null;
  }

  setAttribute(key: string, value: string | number | boolean): void {
    const ctx = this.current();
    if (ctx) ctx.attributes[key] = value;
  }

  /// Termine un span : log + export OTLP.
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
      // Export OTLP (no-op si l'endpoint n'est pas configuré).
      this.exporter.enqueue(ctx, status);
    });
  }

  /// Crée un span enfant (pour appels sortants : DB, HTTP).
  childSpan(operation: string, attributes: Record<string, string | number | boolean> = {}): TraceContext {
    const parent = this.current();
    const child: TraceContext = {
      traceId: parent?.traceId ?? randomUUID().replace(/-/g, ''),
      spanId: randomUUID().slice(0, 16),
      ...(parent?.spanId !== undefined && { parentSpanId: parent.spanId }),
      operation,
      startedAt: Date.now(),
      attributes,
    };
    return child;
  }

  /// Middleware Express (utilisé par `main.ts`).
  middleware() {
    return (req: any, res: any, next: any) => {
      const op = `${req.method} ${req.route?.path ?? req.path}`;
      this.run(op, async (ctx) => {
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
