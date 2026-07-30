// MetricsService — exposition Prometheus (sans dépendance lourde).
//
// On expose /v1/metrics au format Prometheus text. Les compteurs
// sont volontairement limités (v2 §11.3) :
//   * erreurs API
//   * latence P95 par endpoint
//   * événements SRS push/pull
//   * webhooks billing
//   * sessions d'étude
//
// Pas de `prom-client` pour éviter 200 Ko de deps — un Map<string,
// number> et un formatteur texte suffisent.
import { Injectable } from '@nestjs/common';

class Counter {
  value = 0;
  labels = new Map<string, number>();
  inc(by = 1, label?: string) {
    this.value += by;
    if (label) this.labels.set(label, (this.labels.get(label) ?? 0) + by);
  }
}

@Injectable()
export class MetricsService {
  readonly httpErrors = new Counter();
  readonly srsPushEvents = new Counter();
  readonly srsPullEvents = new Counter();
  readonly billingWebhooks = new Counter();
  readonly examAttempts = new Counter();
  readonly authLogins = new Counter();
  readonly authRefreshes = new Counter();

  // Latence (P95 calculé sur les 1000 dernières requêtes par route).
  private latencies = new Map<string, number[]>();

  recordHttpError(route: string) {
    this.httpErrors.inc(1, route);
  }

  recordLatency(route: string, ms: number) {
    let arr = this.latencies.get(route);
    if (!arr) {
      arr = [];
      this.latencies.set(route, arr);
    }
    arr.push(ms);
    if (arr.length > 1000) arr.shift();
  }

  recordSrsPush(events: number) {
    this.srsPushEvents.inc(events);
  }

  recordSrsPull(events: number) {
    this.srsPullEvents.inc(events);
  }

  recordBillingWebhook(kind: 'paid' | 'failed' | 'canceled' | 'unknown') {
    this.billingWebhooks.inc(1, kind);
  }

  recordExamAttempt() {
    this.examAttempts.inc();
  }

  recordAuthLogin(method: 'signup' | 'login' | 'magic' | 'google') {
    this.authLogins.inc(1, method);
  }

  recordAuthRefresh() {
    this.authRefreshes.inc();
  }

  /// Génère le dump Prometheus.
  toPrometheus(): string {
    const lines: string[] = [];
    lines.push('# HELP medanki_http_errors_total Nombre d\'erreurs HTTP par route');
    lines.push('# TYPE medanki_http_errors_total counter');
    lines.push(`medanki_http_errors_total ${this.httpErrors.value}`);
    lines.push('# HELP medanki_srs_push_events_total Événements SRS poussés');
    lines.push('# TYPE medanki_srs_push_events_total counter');
    lines.push(`medanki_srs_push_events_total ${this.srsPushEvents.value}`);
    lines.push('# HELP medanki_srs_pull_events_total Événements SRS tirés');
    lines.push('# TYPE medanki_srs_pull_events_total counter');
    lines.push(`medanki_srs_pull_events_total ${this.srsPullEvents.value}`);
    lines.push('# HELP medanki_billing_webhooks_total Webhooks billing par type');
    lines.push('# TYPE medanki_billing_webhooks_total counter');
    for (const [k, v] of this.billingWebhooks.labels) {
      lines.push(`medanki_billing_webhooks_total{kind="${k}"} ${v}`);
    }
    lines.push('# HELP medanki_exam_attempts_total Tentatives d\'examen');
    lines.push('# TYPE medanki_exam_attempts_total counter');
    lines.push(`medanki_exam_attempts_total ${this.examAttempts.value}`);
    lines.push('# HELP medanki_auth_logins_total Connexions par méthode');
    lines.push('# TYPE medanki_auth_logins_total counter');
    for (const [k, v] of this.authLogins.labels) {
      lines.push(`medanki_auth_logins_total{method="${k}"} ${v}`);
    }
    lines.push('# HELP medanki_auth_refreshes_total Refresh tokens');
    lines.push('# TYPE medanki_auth_refreshes_total counter');
    lines.push(`medanki_auth_refreshes_total ${this.authRefreshes.value}`);

    // Latence P95 (approximation simple).
    lines.push('# HELP medanki_http_latency_p95_ms Latence P95 par route');
    lines.push('# TYPE medanki_http_latency_p95_ms gauge');
    for (const [route, arr] of this.latencies) {
      if (arr.length === 0) continue;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor(sorted.length * 0.95);
      const p95 = sorted[Math.min(idx, sorted.length - 1)]!;
      lines.push(`medanki_http_latency_p95_ms{route="${route}"} ${p95}`);
    }
    return lines.join('\n');
  }
}
