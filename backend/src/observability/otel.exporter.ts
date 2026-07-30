// OtelExporter — Phase 14 : export OTLP des spans.
//
// Léger : on sérialise les spans terminés en JSON et on les envoie
// par batch à l'endpoint OTLP HTTP. Pas de SDK complet @opentelemetry
// (5 Mo de deps), juste `fetch()`.
//
// Format : OTLP/HTTP JSON encoding
// (https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding)
// Compatible Grafana Tempo, Jaeger, Honeycomb.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TraceContext } from './tracing.service';

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'SPAN_KIND_INTERNAL' | 'SPAN_KIND_SERVER' | 'SPAN_KIND_CLIENT';
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string; boolValue?: boolean } }>;
  status: { code: 'STATUS_CODE_OK' | 'STATUS_CODE_ERROR' };
}

@Injectable()
export class OtelExporter {
  private readonly logger = new Logger(OtelExporter.name);
  private readonly buffer: OtlpSpan[] = [];
  private readonly maxBuffer = 1000;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly endpoint: string | undefined;
  private readonly serviceName: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT');
    this.serviceName = this.config.get<string>('OTEL_SERVICE_NAME') ?? 'medanki-backend';
    if (this.endpoint) {
      this.flushTimer = setInterval(() => this.flush(), 30_000);
      this.logger.log(`OTel exporter enabled → ${this.endpoint}`);
    } else {
      this.logger.debug('OTel exporter disabled (no endpoint set)');
    }
  }

  /// Enfile un span terminé. Flush si le buffer est plein.
  enqueue(ctx: TraceContext, status: 'ok' | 'error'): void {
    if (!this.endpoint) return;
    const startNs = ctx.startedAt * 1_000_000;
    const endNs = Date.now() * 1_000_000;
    const otlpSpan: OtlpSpan = {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: ctx.parentSpanId,
      name: ctx.operation,
      kind: 'SPAN_KIND_SERVER',
      startTimeUnixNano: String(startNs),
      endTimeUnixNano: String(endNs),
      attributes: Object.entries(ctx.attributes).map(([k, v]) => ({
        key: k,
        value:
          typeof v === 'string'
            ? { stringValue: v }
            : typeof v === 'number'
              ? { intValue: String(v) }
              : { boolValue: v },
      })),
      status: { code: status === 'ok' ? 'STATUS_CODE_OK' : 'STATUS_CODE_ERROR' },
    };
    this.buffer.push(otlpSpan);
    if (this.buffer.length >= this.maxBuffer) {
      this.flush();
    }
  }

  /// Flush le buffer vers l'endpoint OTLP. Best-effort : les
  /// échecs sont loggés mais ne bloquent jamais l'app.
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.endpoint) return;
    const spans = this.buffer.splice(0, this.buffer.length);
    const body = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: this.serviceName } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'medanki-tracing', version: '0.1.0' },
              spans,
            },
          ],
        },
      ],
    };
    try {
      const res = await fetch(`${this.endpoint}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.warn(`OTel flush échoué: ${res.status}`);
      }
    } catch (e) {
      this.logger.warn(`OTel flush exception: ${(e as Error).message}`);
    }
  }

  onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    // Flush final (synchrone — on n'attend pas la promesse).
    this.flush();
  }
}
