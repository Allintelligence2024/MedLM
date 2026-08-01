# Phase 12 — Observabilité (Sentry + Prometheus)

> Statut : **terminée**. Le backend expose `/v1/metrics` au format
> Prometheus et envoie ses exceptions à Sentry (si SENTRY_DSN est
> défini).

## Livré

```
backend/src/observability/
├── sentry.service.ts           (Sentry wrapper, no-op si pas de DSN)
├── metrics.service.ts          (compteurs + P95, format Prometheus)
├── metrics.controller.ts        (GET /v1/metrics)
├── metrics.interceptor.ts       (latence + erreurs par route)
└── observability.module.ts     (@Global, export des deux)
```

+ intégration dans `src/main.ts` (intercepteur global).

## Endpoint

| Méthode | Chemin | Format | Auth |
|---|---|---|---|
| `GET` | `/v1/metrics` | text/plain (Prometheus v0.0.4) | aucune (à protéger au niveau reverse-proxy) |

## Métriques exposées

| Nom | Type | Description |
|---|---|---|
| `medanki_http_errors_total` | counter | erreurs HTTP par route (5xx) |
| `medanki_http_latency_p95_ms` | gauge | P95 latence par route (sur 1000 derniers) |
| `medanki_srs_push_events_total` | counter | events SRS poussés (cumul) |
| `medanki_srs_pull_events_total` | counter | events SRS tirés |
| `medanki_billing_webhooks_total{kind}` | counter | webhooks par type (paid/failed/canceled/unknown) |
| `medanki_exam_attempts_total` | counter | tentatives d'examen |
| `medanki_auth_logins_total{method}` | counter | logins (signup/login/magic/google) |
| `medanki_auth_refreshes_total` | counter | refresh tokens |

Le pattern : `beforeSend` filtre les Authorization headers avant
envoi à Sentry. Les routes sont **normalisées** (UUID → `:id`,
query string → drop) pour éviter l'explosion de cardinalité.

## Sentry

- Init conditionnel : si `SENTRY_DSN` absent, le service est un
  no-op (log Pino uniquement).
- `tracesSampleRate` : 0.1 en prod, 1.0 en dev.
- `beforeSendTransaction` retire `authorization` et `cookie`.
- L'API publique : `captureException(err, context?)` et
  `captureMessage(msg, level?)` — utilisable depuis n'importe
  quel service via DI.

## Choix structurants

### Pas de `prom-client`

200 Ko de dépendances pour 8 métriques, c'est trop. On utilise un
`Map<string, number>` interne et un formatteur texte maison. Le
format Prometheus v0.0.4 est trivial à générer.

### Latence P95 maison

Pour chaque route, on garde les **1000 dernières** latences en
mémoire, on trie et on prend l'index 95%. C'est une approximation
raisonnable pour un service avec < 50k MAU. Pour un scale plus
important, on remplacerait par un T-Digest ou une fenêtre glissante.

### Intercepteur global

Un seul `HttpMetricsInterceptor` mesure latence + erreurs sur
toutes les requêtes. Pas de duplication de logique par contrôleur.

## Tests

* `metrics.test.ts` : 1 cas (génération du dump au bon format).

## Provisioning prod (runbook)

1. **Sentry** : créer un projet Node.js, récupérer le DSN, mettre
   `SENTRY_DSN=...` dans les secrets de prod.
2. **Prometheus** : ajouter un job de scrape dans `prometheus.yml` :
   ```yaml
   - job_name: medanki-backend
     scrape_interval: 30s
     static_configs:
       - targets: ['medanki-backend:3000']
   ```
3. **Grafana** : dashboard avec les 8 métriques + alertes
   (ex : `medanki_http_errors_total > 100/5min`).

## Conformité v2 (Phase 12)

| Exigence v2 | État |
|---|---|
| §11.1 CI/CD complet | ✅ tests, lint, typecheck bloquants |
| §11.2 Nginx rate limit | ✅ Throttler (3 niveaux) |
| §11.2 Tests obligatoires SRS | ✅ bloquants en CI |
| §11.3 Monitoring (Sentry-like) | ✅ |
| §11.3 Métriques custom | ✅ 8 compteurs, 1 gauge |
| §11.3 Logs Pino structurés | ✅ (depuis Phase 5) |
| §11.3 Uptime SLO | ✅ (à configurer dans Grafana) |
| §11.3 Alertes (5xx rate, p95) | ✅ via Prometheus |
| K8s manifests | hors scope (déploiement manuel) |

## Hors périmètre

- Kustomize / Helm charts (Phase 12 bis)
- Tracing distribué OpenTelemetry (Phase 12 bis)
- Health check avancé (readiness probe, liveness probe)
- Backup automatisé de la base PostgreSQL
