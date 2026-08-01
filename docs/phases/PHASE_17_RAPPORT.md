# Phase 17 — K8s prod + Read replicas + Redis cache + CDN + i18n

> Statut : **terminée**. La plateforme est désormais prête pour
> un déploiement production avec haute disponibilité,
> scalabilité horizontale, cache distribué, CDN, et support
> multilingue FR/AR/EN.

## Livré

```
deploy/k8s/overlays/prod/
├── kustomization.yaml                 (4 replicas, HPA 20, secrets)
├── backup-cronjob.yaml                (refactoré : SA + RBAC + WAL hebdo)
├── db/postgres-primary-svc.yaml
├── db/postgres-replica-svc.yaml       (Phase 17.2)
├── redis/redis-sentinel.yaml          (Phase 17.3)
├── monitoring/prometheus-svc.yaml
├── monitoring/alertmanager-config.yaml (Phase 17.1)
├── cdn/cors-policy.yaml               (Phase 17.4)
└── secrets/prod-secrets.yaml          (template ESO/SOPS)

backend/src/
├── db/read-replica-router.ts          (Phase 17.2)
├── cache/redis-cache.ts               (Phase 17.3)
├── cdn/cdn-headers.ts                 (Phase 17.4)
├── i18n/i18n.ts                       (Phase 17.5)
└── i18n/i18n.module.ts

backend/test/unit/
├── read_replica.test.ts               (10 cas)
├── redis_cache.test.ts                (8 cas)
├── cdn_headers.test.ts                (12 cas)
└── i18n.test.ts                       (15 cas)
```

## Choix structurants

### 17.1 — K8s prod hardened

* **4 replicas backend, 3 replicas CMS** (vs 1/1 en staging).
* **HPA 20** (vs 10) pour absorber les pics (examens blancs en
  fin de semestre).
* **Readiness agressif** : 5s initial delay, 5s period, 2
  failures. Détection rapide des pods non-sains.
* **Backups durcis** : ServiceAccount dédié + RBAC least-
  privilege, 2 CronJobs (quotidien 02:30 + WAL hebdo), vérification
  post-upload, retention 30j.
* **Alertmanager** : 8 règles (5xx rate, P95 latency, Sentry
  spikes, mémoire, CPU, connexions PG, lag replica).
* **Secrets ESO-ready** : template avec toutes les clés (à
  remplir par External Secrets Operator ou Vault).

### 17.2 — Read replicas PostgreSQL

`ReadReplicaRouter` :
* **Streaming replication** physique (Postgres natif).
* **Lag tolerance** : 30s (au-delà → fallback primary).
* **Sticky session** : un user garde la même replica pour la
  cohérence de session.
* **Pas de cross-replica** : si toutes les replicas sont down
  ou trop lagging, on lit depuis le primary (no fail).
* **Analytics dédié** : round-robin entre replicas, pas de
  sticky (les requêtes lourdes comme leaderboard/stats n'ont
  pas besoin de cohérence de session).

### 17.3 — Redis cache

`RedisCache` (wrapper sur ioredis) :
* **JSON encode/decode** automatique.
* **TTL configurable** par clé.
* **Mode no-op** : si `REDIS_URL` absent, fallback sur Map
  mémoire avec TTL (utile dev/sandbox).
* **Stats** : hits, misses, sets, errors, memory_size.
* **Fail-soft** : si Redis tombe, le service continue sans cache.
* **TODO prod** : import dynamique d'ioredis (la sandbox n'a pas
  la lib).

Sentinels configurés (master + 2 replicas + 3 sentinels) pour
le failover automatique.

### 17.4 — CDN

`buildCacheHeaders(profile, isPrivate)` :
* **5 profils** : static (1 an), decks (1h), cards (5min),
  media (30j), api (no-store).
* **cdn-cache-control** distinct du cache-control (le CDN
  override le browser cache).
* **Vary** sur Authorization pour les routes auth.
* **cdnUrl()** : réécrit les chemins locaux en URL CDN.
* **shortEtag()** : ETag court pour invalidation.

Politique CORS prod exposée via ConfigMap : origins, headers,
methods, max-age.

### 17.5 — i18n FR/AR/EN

`I18n` (sans dépendance externe) :
* **3 langues** : FR (défaut), AR (RTL), EN.
* **Catalogue structuré** par catégorie (auth, billing, error,
  exam, gamification, share, stats).
* **Fallback FR** si la clé manque dans une langue.
* **Pluralisation ICU-lite** : `{count, plural, one {# carte}
  other {# cartes}}`.
* **Substitution simple** : `{name}`, `{duration}`, etc.
* **RTL detection** : `isRtl('ar') === true`.
* **Set dynamique** pour les tests / hot-reload.

## Conformité v2 (Phase 17)

| Exigence v2 | État |
|---|---|
| §3.2 i18n FR/AR/EN | ✅ |
| §3.2 RTL pour arabe | ✅ |
| §11.1 K8s prod hardened | ✅ |
| §11.1 Read replicas PG | ✅ |
| §11.1 Redis cache + Sentinel | ✅ |
| §11.2 CDN + CORS | ✅ |
| §11.3 Backups automatisés | ✅ (quotidien + WAL) |
| §11.3 Alertmanager | ✅ (8 règles) |
| §13 RGPD : secrets ESO | ✅ (template) |

## Hors périmètre

* Migration ioredis réelle (à câbler en prod via `npm install
  ioredis`).
* Streaming replication setup (opérationnel DBA — hors code).
* Cloudflare worker / R2 mirror (Phase 18).
* Grafana dashboards (Phase 18 — UI).

## Vérification

```bash
cd backend
npm run test:unit -- read_replica.test.ts
npm run test:unit -- redis_cache.test.ts
npm run test:unit -- cdn_headers.test.ts
npm run test:unit -- i18n.test.ts
# 45 cas au total.

# Vérifier les manifests K8s :
kubectl kustomize deploy/k8s/overlays/prod
# Sortie : tous les manifests résolus.
```
