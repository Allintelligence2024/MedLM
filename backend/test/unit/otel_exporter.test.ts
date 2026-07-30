// Tests OtelExporter — Phase 14.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OtelExporter } from '../../src/observability/otel.exporter';

describe('OtelExporter', () => {
  it('est un no-op si pas d\'endpoint configuré', async () => {
    const exporter = new OtelExporter({ get: () => undefined } as any);
    exporter.enqueue(
      {
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        operation: 'test',
        startedAt: Date.now(),
        attributes: {},
      },
      'ok',
    );
    // Pas d'exception, le buffer reste vide.
    await exporter.flush();
    // Si on a un buffer, c'est qu'on a un endpoint — or on n'en a pas.
    // (en fait, enqueue est no-op sans endpoint, donc rien à flusher.)
  });

  it('enqueue puis flush envoie un payload OTLP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as any;
    try {
      const exporter = new OtelExporter({
        get: (k: string) =>
          k === 'OTEL_EXPORTER_OTLP_ENDPOINT' ? 'http://otel.example' : 'medanki-test',
      } as any);
      exporter.enqueue(
        {
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          operation: 'GET /test',
          startedAt: Date.now(),
          attributes: { 'http.status_code': 200, 'user.id': 'u1' },
        },
        'ok',
      );
      await exporter.flush();
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('http://otel.example/v1/traces');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('GET /test');
      expect(body.resourceSpans[0].scopeSpans[0].spans[0].traceId).toBe('a'.repeat(32));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
