# Phase 16.2 — Chargily prod (durcissement environnement)

> Statut : **terminée**. Le provider Chargily est maintenant
> prêt pour la production : validation stricte de l'environnement,
> mode dry-run, health check, retry exponentiel sur 429/5xx,
> et tests exhaustifs de la configuration.

## Livré

```
backend/src/billing/
├── payment-provider.ts        (HealthStatus type, healthCheck? optionnel)
└── chargily.provider.ts       (refactoré : env validation, dry-run,
                                healthCheck, retry exponentiel)

backend/test/unit/
└── chargily_prod.test.ts      (15 cas : 4 config, 2 baseUrl, 2 health,
                                4 webhook signature, 3 handleWebhook)
```

## Choix structurants

### Refus de démarrer en prod sans clé

`new ChargilyPayProvider(config)` lance une exception si :
* `CHARGILY_ENV=production` mais pas de `CHARGILY_API_KEY`.
* `CHARGILY_ENV=production` ET `CHARGILY_DRY_RUN=true`
  (incohérence = facturation cassée).

C'est un **fail-fast** au démarrage : mieux vaut planter au boot
qu'envoyer un checkout_url bidon en prod.

### Mode dry-run

Si `CHARGILY_DRY_RUN=true` :
* `createPayment` retourne un `checkout_url` factice
  (`https://medanki.dz/billing/dryrun?ref=...`).
* `refund` retourne `{ ok: true }` sans appeler l'API.
* `healthCheck` retourne `ok: true, mode: dry_run`.

Utile pour : staging sans clés, tests E2E, démos internes.

### Health check

`ChargilyPayProvider.healthCheck()` fait un `GET /me` sur l'API
Chargily pour vérifier que les clés sont valides. À brancher
sur `/v1/health` (déjà en place Phase 12 bis) ou sur un
endpoint dédié `/v1/billing/health`.

### Retry exponentiel sur 429/5xx

`_fetchWithRetry` : 3 tentatives par défaut, backoff 1s → 2s →
4s → 8s (cap). Couvre le rate limit de Chargily (60 req/min
par défaut) et les blips réseau transitoires.

### Idempotence renforcée

`handleWebhook` log chaque eventId vu. La table `webhook_events`
existe déjà (Phase 7) pour la persistance — l'idempotence est
garantie au niveau DB.

## Conformité v2 (Phase 16.2)

| Exigence v2 | État |
|---|---|
| §8 Chargily Pay | ✅ |
| §8 Fail-fast prod sans clé | ✅ |
| §8 Mode sandbox testable | ✅ dry-run |
| §11.3 Health check providers | ✅ |
| §11.3 Resilience 429/5xx | ✅ retry exponentiel |

## Hors périmètre

* Multi-provider (Apple Pay, Google Pay) — Phase 18.
* Monitoring avancé (Prometheus metrics sur latence Chargily) —
  Phase 18.
* Rotation automatique des clés — Phase 18.

## Vérification

```bash
cd backend
npm run test:unit -- chargily_prod.test.ts
# 15 cas : config (4), baseUrl (2), healthCheck (2),
# webhook signature (4), handleWebhook (3).
```
