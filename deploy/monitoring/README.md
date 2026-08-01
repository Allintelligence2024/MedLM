# Observabilité — MedAnki DZ

Livrables de l'item **P2-3** de l'audit du 2026-08-01 : jusqu'ici les
métriques étaient exposées (`/v1/metrics`, annotation de scrape en
place) mais **aucun tableau de bord ni alerte** n'existait, et Sentry /
OTel restaient des no-op non documentés.

## Contenu

| Fichier | Rôle |
|---|---|
| `grafana-backend-slo.json` | Tableau de bord Grafana (9 panneaux) : P95, taux 5xx, trafic, dispo, sync SRS, auth, billing, examens |
| `alerts.yml` | Règles Prometheus — SLO latence/erreurs/dispo + 3 alertes métier |

## Métriques exposées

Le backend expose un dump Prometheus texte sur **`GET /v1/metrics`**
(sans auth : à réserver au réseau interne / IP allow-list au niveau du
reverse proxy).

| Métrique | Type | Labels |
|---|---|---|
| `medanki_http_requests_total` | counter | `route` |
| `medanki_http_errors_total` | counter | `route` |
| `medanki_http_latency_p95_ms` | gauge | `route` |
| `medanki_srs_push_events_total` | counter | — |
| `medanki_srs_pull_events_total` | counter | — |
| `medanki_billing_webhooks_total` | counter | `kind` |
| `medanki_auth_logins_total` | counter | `method` |
| `medanki_auth_refreshes_total` | counter | — |
| `medanki_exam_attempts_total` | counter | — |

> `medanki_http_requests_total` a été **ajouté** avec ce lot : sans
> dénominateur, la règle SLO « 5xx < 1 % » n'était pas exprimable.

## Installation

### Grafana

Import → *Upload JSON file* → `grafana-backend-slo.json`, puis
sélectionner la datasource Prometheus. Ou en provisioning :

```yaml
# /etc/grafana/provisioning/dashboards/medanki.yml
apiVersion: 1
providers:
  - name: medanki
    folder: MedAnki
    type: file
    options:
      path: /var/lib/grafana/dashboards/medanki
```

### Prometheus

Avec `kube-prometheus-stack`, encapsuler `alerts.yml` dans un
`PrometheusRule` :

```bash
kubectl -n medanki create configmap medanki-alerts \
  --from-file=deploy/monitoring/alerts.yml
```

Sinon, référencer le fichier dans `rule_files:` de `prometheus.yml`.

## Variables d'environnement associées

Toutes documentées dans `backend/.env.example` :

| Variable | Effet si absente |
|---|---|
| `SENTRY_DSN` | Sentry en **no-op** (aucune erreur remontée) |
| `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | valeurs par défaut |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | export de traces **désactivé** |
| `OTEL_SERVICE_NAME` | `medanki-backend` |
| `APP_VERSION` | `dev` (remonté par `/v1/health`) |

C'est volontaire : le backend démarre et fonctionne sans aucune de ces
variables. Mais **en production, leur absence signifie « aucune
visibilité »** — les renseigner fait partie de la checklist de mise en
production.

## Seuils

| SLO | Objectif | Alerte |
|---|---|---|
| Latence | P95 < 500 ms | `MedankiLatencyP95High` (warning, 5 min) / `…Critical` > 1,5 s |
| Erreurs | 5xx < 1 % | `MedankiErrorRateHigh` (critical, 5 min) |
| Disponibilité | 99,5 % | `MedankiBackendDown` (critical, 2 min) |
