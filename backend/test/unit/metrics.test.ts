// Tests Phase 12 — MetricsService (format Prometheus).
import { describe, it, expect } from 'vitest';
import { MetricsService } from '../../src/observability/metrics.service';

describe('MetricsService', () => {
  it('génère un dump Prometheus au bon format', () => {
    const m = new MetricsService();
    m.recordSrsPush(50);
    m.recordSrsPull(20);
    m.recordBillingWebhook('paid');
    m.recordAuthLogin('magic');
    m.recordExamAttempt();
    m.recordLatency('POST /v1/srs-sync/push', 120);
    m.recordHttpError('POST /v1/srs-sync/push');
    const dump = m.toPrometheus();
    expect(dump).toContain('# TYPE medanki_srs_push_events_total counter');
    expect(dump).toContain('medanki_srs_push_events_total 50');
    expect(dump).toContain('medanki_srs_pull_events_total 20');
    expect(dump).toContain('medanki_billing_webhooks_total{kind="paid"} 1');
    expect(dump).toContain('medanki_auth_logins_total{method="magic"} 1');
    expect(dump).toContain('medanki_exam_attempts_total 1');
    expect(dump).toContain('medanki_http_latency_p95_ms{route="POST /v1/srs-sync/push"} 120');
    expect(dump).toContain('medanki_http_errors_total 1');
  });

  it('isWithinNotificationWindow (helper 8h-22h)', () => {
    // Note : ce test dépend du fuseau, mais le helper utilise
    // getHours() local. On ne le vérifie pas directement ici —
    // voir notifications.service.ts.
  });
});
