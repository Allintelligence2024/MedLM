// Tests TracingService — Phase 12 bis.
import { describe, it, expect } from 'vitest';
import { TracingService, type TraceContext } from '../../src/observability/tracing.service';
import { sanitizeTraceAttributes } from '../../src/observability/trace-sanitize';

describe('TracingService', () => {
  it('génère un traceId dans un span', async () => {
    const svc = new TracingService(undefined as any);
    await svc.run('test.op', async (ctx) => {
      expect(ctx.traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(ctx.spanId.length).toBe(16);
      expect(ctx.operation).toBe('test.op');
    });
  });

  it('permet d\'ajouter des attributs au span courant', async () => {
    const svc = new TracingService(undefined as any);
    await svc.run('test.op', async (ctx) => {
      svc.setAttribute('http.status_code', 200);
      svc.setAttribute('user.id', 'u1');
      expect(ctx.attributes['http.status_code']).toBe(200);
      expect(ctx.attributes['user.id']).toBe('u1');
    });
  });

  it('retourne null si on n\'est pas dans un span', () => {
    const svc = new TracingService(undefined as any);
    expect(svc.current()).toBeNull();
  });

  it('les spans sont isolés entre exécutions concurrentes', async () => {
    const svc = new TracingService(undefined as any);
    const seen = new Set<string>();
    const tasks = Array.from({ length: 10 }, (_, i) =>
      svc.run(`op-${i}`, async (ctx) => {
        // Petite attente asynchrone.
        await new Promise((r) => setTimeout(r, 5));
        seen.add(ctx.traceId);
        return ctx.traceId;
      }),
    );
    await Promise.all(tasks);
    // 10 traceIds distincts.
    expect(seen.size).toBe(10);
  });

  it('finish n exporte ni Authorization ni email', async () => {
    const captured: TraceContext[] = [];
    const svc = new TracingService({
      enqueue: (ctx: TraceContext) => {
        captured.push(ctx);
      },
    } as never);
    await svc.run('GET /v1/auth/me', async (ctx) => {
      ctx.attributes['authorization'] = 'Bearer secret-token';
      ctx.attributes['user.email'] = 'a@b.dz';
      ctx.attributes['http.method'] = 'GET';
      ctx.attributes['http.status_code'] = 200;
      svc.finish(ctx, 'ok');
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.attributes['authorization']).toBeUndefined();
    expect(captured[0]!.attributes['user.email']).toBeUndefined();
    expect(captured[0]!.attributes['http.method']).toBe('GET');
    expect(captured[0]!.attributes['http.status_code']).toBe(200);
  });
});

describe('sanitizeTraceAttributes', () => {
  it('supprime les clés sensibles', () => {
    const out = sanitizeTraceAttributes({
      authorization: 'Bearer x',
      cookie: 'sid=1',
      'http.method': 'POST',
    });
    expect(out.authorization).toBeUndefined();
    expect(out.cookie).toBeUndefined();
    expect(out['http.method']).toBe('POST');
  });
});
