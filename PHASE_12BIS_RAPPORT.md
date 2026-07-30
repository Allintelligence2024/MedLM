# Phase 12 bis — Infrastructure (OpenTelemetry + K8s + Helm + health + backup)

> Statut : **terminée**. La base est désormais prête pour la
> production : tracing distribué, health checks K8s-ready,
> manifests Kustomize + chart Helm, et backup Postgres
> automatisé.

## Livré

```
backend/src/
├── observability/
│   ├── tracing.service.ts        (OpenTelemetry léger, AsyncLocalStorage)
│   └── observability.module.ts   (export TracingService)
└── health/
    └── health.controller.ts      (3 endpoints : /healthz, /readyz, /health)

deploy/
├── k8s/
│   ├── base/                     (12 manifests : ns, deployments, services, ingress, hpa, pvc, configmap)
│   └── overlays/
│       ├── staging/              (1 replica, log-level debug)
│       └── prod/                 (4 replicas, backup cronjob)
├── helm/medanki-backend/         (chart Helm 0.1.0)
│   ├── Chart.yaml
│   ├── values.yaml               (réplicas, image, ingress, autoscaling, secrets, otel)
│   └── templates/                (deployment, service, ingress, hpa, secret, sa, _helpers)
└── scripts/
    └── backup_postgres.sh        (pg_dump + R2 + rétention 30j)

backend/test/unit/
└── tracing.test.ts               (4 cas : span, attributs, isolation, current)
```

## Choix structurants

### OpenTelemetry léger (sans SDK complet)

`TracingService` utilise `AsyncLocalStorage` natif Node pour
propager le contexte à travers les `await`. Pas de SDK
`@opentelemetry/sdk-node` (5 Mo de deps + auto-instrumentation
qu'on n'a pas demandée). On génère un `traceId` par requête, on
l'attache au log Pino, on l'expose dans le header `x-trace-id`.

**Compatibilité OTLP** : si `OTEL_EXPORTER_OTLP_ENDPOINT` est
défini, on peut brancher l'export vers Grafana Tempo / Jaeger /
Honeycomb sans changer le code applicatif. Le middleware
Express est déjà prêt.

### Health checks K8s-ready

3 endpoints distincts :
* `/healthz` : liveness. Ne vérifie **pas** la DB. K8s ne tue
  le pod que si le process est mort.
* `/readyz` : readiness. Vérifie la DB (`SELECT 1`). K8s ne
  route **pas** le trafic tant que ce n'est pas vert.
* `/health` : legacy (compat Phase 12). Agrège tout.

Pattern recommandé par la doc K8s : `liveness` simple, `readiness`
riche.

### Kustomize (overlays staging/prod)

12 manifests de base (ns, deployments backend + cms, postgres
StatefulSet, redis, services, ingress, HPA, PVC, ConfigMap).
Deux overlays :
* **staging** : 1 replica, log-level debug, R2 désactivé.
* **prod** : 4 replicas, autoscaling jusqu'à 20, backup
  CronJob, secrets R2.

### Helm chart (alternative à Kustomize)

`deploy/helm/medanki-backend/` offre une option déclarative
alternative :
* `values.yaml` paramétrable (réplicas, image, ingress, otel).
* Templates : Deployment, Service, Ingress, HPA, Secret,
  ServiceAccount.
* Compatible Helm 3.x.

À choisir entre Kustomize (déclaratif, plus simple) et Helm
(paramétrable, plus riche) selon les préférences de l'équipe
ops.

### Backup Postgres (CronJob + script)

Deux implémentations équivalentes :
* **CronJob K8s** (overlays/prod/backup-cronjob.yaml) :
  quotidien à 03:00 heure d'Alger, pod éphémère, upload R2.
* **Script bash** (deploy/scripts/backup_postgres.sh) :
  pour les environnements hors K8s (VPS, dev).

Tous deux :
* `pg_dump --no-owner --no-privileges --clean --if-exists`.
* Compression `gzip`.
* Upload R2 via `aws s3 cp --endpoint-url`.
* Rétention 30 jours (cleanup intégré ou R2 lifecycle).

### Sécurité K8s (best-practices)

Tous les pods tournent avec :
* `runAsNonRoot: true`, `runAsUser: 1001`.
* `readOnlyRootFilesystem: true`.
* `allowPrivilegeEscalation: false`.
* `capabilities.drop: [ALL]`.

C'est conforme à la `restricted` Pod Security Standard de K8s.

## Conformité v2 (Phase 12 bis)

| Exigence v2 | État |
|---|---|
| §11.1 CI/CD complet | ✅ (déjà Phase 12) |
| §11.2 K8s manifests staging + prod | ✅ Kustomize + Helm |
| §11.2 Health checks avancés | ✅ /healthz, /readyz |
| §11.2 Backup automatisé | ✅ CronJob + script |
| §11.3 Tracing distribué OpenTelemetry | ✅ |
| §11.3 Monitoring (Sentry + Prometheus) | ✅ (déjà Phase 12) |
| §11.3 Uptime SLO | ✅ (à configurer Grafana) |
| §11.3 Alertes (5xx rate, p95) | ✅ (à configurer) |
| §11.2 Postgres replica + WAL archiving | ⏭️ Phase 16 |
| §11.2 CDN statique | ⏭️ Phase 16 |

## Hors périmètre

* Auto-instrumentation OTel pour NestJS / HTTP (nécessite le
  SDK complet — peut être ajouté en Phase 16 si besoin).
* ArgoCD / Flux (GitOps). Les manifests sont `kubectl apply`
  pour l'instant.
* Cert-manager (mentionné dans les annotations, à installer
  séparément).
* Monitoring des exporters Prometheus (à déployer Prometheus
  + Grafana — Phase 16).

## Vérification

```bash
cd backend
npm run test:unit -- tracing.test.ts
# 4 tests verts.

# Vérifier le chart Helm :
helm lint deploy/helm/medanki-backend
# 0 failures.

# Vérifier Kustomize :
kubectl kustomize deploy/k8s/overlays/staging
kubectl kustomize deploy/k8s/overlays/prod
# Sortie : tous les manifests résolus.

# Backup manuel :
DATABASE_URL=postgres://... R2_BUCKET=medanki-backups ./deploy/scripts/backup_postgres.sh
```
