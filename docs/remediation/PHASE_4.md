# Phase 4 — Données et infrastructures applicatives (R04, R05, R09)

Date : 2026-09-27. Branche : `arena/01a0defd-medlm`.
Décision inchangée : **NO-GO production**. Pas de déploiement, pas de Chargily.

## Ce qui est fermé ici

- **R04** — `CacheModule` attend `RedisCache.connect()` avant d'exporter
  l'instance. `GatewayModule` lit `cache.client` ensuite : le budget n'est
  plus une `Map` d'instance dès que `REDIS_URL` est posé. Le client ioredis
  est **conservé** si le ping initial échoue (sinon on retombait en mémoire
  et le trou de prod restait). `GATEWAY_BUDGET_ON_REDIS_ERROR=fail-open`
  (défaut) ou `fail-closed` (remaining = 0). `close()` au shutdown.
  CI **sans** service Redis : le chemin deux pods est un `FakeRedis` unitaire.
- **R05** — contrat nominatif `REQUIRED_FOREIGN_KEYS` (pas un compteur).
  Migration `0027_missing_fkeys.sql` : orphelins réparés (DELETE/NULL) puis
  ADD CONSTRAINT. `review_logs` / `srs_card_state` en **RESTRICT** pour ne
  pas combattre le trigger append-only. Orphelins de `review_logs` non
  supprimés : une base sale échoue fort. Effacement = anonymisation
  (`erased-{id}@invalid.invalid`), jamais `DELETE users` tant que le journal
  existe.
- **R09** — middleware `TracingService` dans `configureApp` ; `x-trace-id`
  sur `/v1/healthz`. Attributs redactés (`authorization`, cookie, token,
  email). Magic-link FR/AR/EN via `I18n`. CDN headers et `ReadReplicaRouter`
  **documentés inutilisés** (lectures : `DRIZZLE_READ` ; API JSON auth : pas
  de CDN). Pas de fake-wire.

## Redis — panne

| `REDIS_URL` | ping | budget | `/v1/readyz` redis |
|---|---|---|---|
| absent | — | mémoire / pod | `memory`, ready |
| posé | ok | Redis partagé | `ok` |
| posé | ko, fail-open | repli mémoire / pod | `down`, **ready** |
| posé | ko, fail-closed | remaining 0 | `down`, **not_ready** |

Fail-open est un choix d'exploitation : un Redis down n'arrête pas l'API,
mais le plafond redevient N × 500/h le temps de la panne. Fail-closed
refuse le GraphQL (budget 0) et retire le pod du LB.

## Effacement

Conservé sous id opaque : `review_logs`, `srs_card_state`, `payment_orders`,
examens. Purge : refresh, devices, MFA, challenges, entitlements, reports,
cursors, séances. Pas d'endpoint HTTP public (trop dangereux) : service
`ErasureService`.

## Non-revendications

- Pas de Redis réel en CI, donc pas de preuve multi-pods en production.
- Pas de MFA étudiant. R11 CMS 501. R10/R12/R13/R14 ouverts. Pas de GO.
- Drizzle `onDelete: cascade` sur `review_logs` **ment** ; PostgreSQL 0027
  est RESTRICT. La source de vérité est SQL.
- Un push SRS d'une carte inconnue : SAVEPOINT par événement, sinon
  PostgreSQL abortait toute la transaction (le `catch` JS ne suffit pas).

## Preuves

- `backend/test/unit/cost_budget_store.test.ts`
- `backend/test/unit/redis_cache.test.ts`
- `backend/test/unit/tracing.test.ts`
- `backend/test/integration/routing.test.ts` (`x-trace-id`)
- `backend/test/integration/postgres-contract.test.ts` (FK nominatives)
- `backend/test/integration/erasure.postgres.test.ts`
- `backend/src/db/fk-inventory.ts`
- migration `0027_missing_fkeys.sql`
