// Tests TracingService — Phase 12 bis.
import { describe, it, expect } from 'vitest';
import { TracingService } from '../../src/observability/tracing.service';

describe('TracingService', () => {
  it('génère un traceId dans un span', async () => {
    const svc = new TracingService();
    await svc.run('test.op', async (ctx) => {
      expect(ctx.traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(ctx.spanId.length).toBe(16);
      expect(ctx.operation).toBe('test.op');
    });
  });

  it('permet d\'ajouter des attributs au span courant', async () => {
    const svc = new TracingService();
    await svc.run('test.op', async (ctx) => {
      svc.setAttribute('http.status_code', 200);
      svc.setAttribute('user.id', 'u1');
      expect(ctx.attributes['http.status_code']).toBe(200);
      expect(ctx.attributes['user.id']).toBe('u1');
    });
  });

  it('retourne null si on n\'est pas dans un span', () => {
    const svc = new TracingService();
    expect(svc.current()).toBeNull();
  });

  it('les spans sont isolés entre exécutions concurrentes', async () => {
    const svc = new TracingService();
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
});
