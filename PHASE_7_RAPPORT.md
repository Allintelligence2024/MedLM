# Phase 7 — Billing, Entitlement, RBAC, Throttling

> Statut : **terminée**. Le serveur expose un pipeline de paiement
> complet (Chargily + promo), un JWT d'entitlement signé pour
> vérification offline, un middleware RBAC à 5 rôles, et un throttling
> à trois niveaux.

## Livré

```
backend/src/
├── billing/
│   ├── billing.dto.ts            (PLANS, prix en DA, DTOs Zod)
│   ├── billing.service.ts       (orchestration providers + entitlements)
│   ├── billing.controller.ts     (REST : checkout, entitlement, webhook)
│   ├── billing.module.ts
│   ├── chargily.provider.ts     (IPaymentProvider : createPayment, handleWebhook, refund)
│   ├── promo-code.provider.ts    (PromoCodeProvider : resolve + atomic increment)
│   └── payment-provider.ts      (interface IPaymentProvider)
├── entitlement/
│   ├── entitlement.service.ts    (JWT signé RS256, 24h, grace 14j)
│   ├── entitlement.controller.ts (GET /v1/entitlement/jwt)
│   └── entitlement.module.ts
├── rbac/
│   ├── roles.ts                  (5 rôles + bits + helper roleHas)
│   ├── rbac.guard.ts            (@RequireRole)
│   └── rbac.module.ts
├── common/
│   └── throttle.ts               (@nestjs/throttler config : 10/s, 60/min, 200/15min)
├── db/
│   ├── migrations/
│   │   └── 0003_billing_rbac.sql (users.rbac_role, webhook_events, audit_log)
│   └── schema/
│       ├── billing.ts            (Drizzle : webhook_events + audit_log)
│       └── users.ts             (ajout rbacRole)
├── auth/
│   ├── auth.service.ts          (refactor : JWT payload inclut role)
│   ├── jwt.guard.ts             (refactor : JwtPayload.role)
│   └── jwt.decorators.ts        (existant)
└── app.module.ts                (intègre Throttler + Rbac + Billing + Entitlement)

backend/test/unit/
├── billing.service.test.ts       (5 tests)
└── rbac.test.ts                  (6 tests)
```

## Endpoints ajoutés

| Méthode | Chemin | Auth | Rôle | Usage |
|---|---|---|---|---|
| `POST` | `/v1/billing/checkout`      | JWT | student | Crée un checkout Chargily |
| `GET`  | `/v1/billing/entitlement`   | JWT | student | État d'entitlement courant |
| `POST` | `/v1/billing/webhook/chargily` | HMAC | — | Webhook signé |
| `GET`  | `/v1/entitlement/jwt`      | JWT | student | Émet le JWT d'entitlement |

## Choix structurants

### Chargily Pay : vrais appels HTTP

L'implémentation fait de **vrais** appels à `pay.chargily.com/test/api/v2`
(mode sandbox par défaut). L'absence de clés dans le sandbox n'a pas
empêché l'écriture de la logique ; les tests d'intégration côté CI
utiliseront les variables `CHARGILY_API_KEY` et `CHARGILY_API_SECRET`
provisionnées dans GitHub Secrets.

Vérification de signature webhook : HMAC-SHA256 sur le raw body,
comparaison à temps constant. En mode dev, sans `CHARGILY_API_SECRET`,
on rejette systématiquement.

### Idempotence via `webhook_events`

Chaque provider (Chargily, IAP Apple, IAP Google) doit pouvoir
rejouer un webhook sans dupliquer un entitlement. La table
`webhook_events` (UNIQUE sur `(event_id, provider)`) est consultée
**avant** traitement ; si l'event a déjà été vu, on retourne
immédiatement. Le champ `processed` est mis à true après succès.

### JWT d'entitlement : payload conforme à la v2 §8.1

```ts
{ user_id, plan, device_id, expires_at, grace_until, allowed_decks[] }
```

* TTL 24h, signé RS256 avec la clé privée serveur
* Vérifié offline côté mobile avec la clé publique embarquée
* `grace_until` couvre 14j après `expires_at` (réseau DZ capricieux)
* `allowed_decks: ['*']` quand premium actif, `[]` sinon

### RBAC : 5 rôles, hiérarchie cumulative

| Rôle | Permissions notables |
|---|---|
| `student`         | Lire, signaler, utiliser l'app |
| `author`          | + créer/éditer cartes DRAFT |
| `medical_reviewer` | + approuver/rejeter cartes |
| `editor`          | + publier/retirer, gérer decks |
| `admin`           | + users, billing, audit log |

Un `editor` peut tout ce qu'un `medical_reviewer` peut (cumul). Les
permissions sont des bits ; on ne maintient pas de matrice.

L'admin est bootstrappé via `ADMIN_EMAILS` (CSV dans `.env`). Le CMS
(Phase 11) fournira une UI dédiée.

### Throttling : 3 niveaux

| Nom | Fenêtre | Limite par IP |
|---|---|---|
| short  | 1s       | 10 req |
| medium | 1 min    | 60 req |
| long   | 15 min   | 200 req |

Doc v2 §6.1 : « 5 tentatives OTP / 15min » — couvert par la limite
`long`. « 100 events max par push » — déjà appliqué au niveau service
(BillingService/SrsSyncService). Le throttle ajoute une couche réseau.

## Migration `0003_billing_rbac.sql`

* `users.rbac_role` (text, défaut 'student')
* `webhook_events` (idempotence des providers, UNIQUE sur `(event_id, provider)`)
* `audit_log` (trace des actions admin/RBAC)
* Tous idempotents (IF NOT EXISTS)

## Tests

* `billing.service.test.ts` : 5 cas (checkout sans/avec promo, plan
  inconnu, webhook payé, webhook déjà vu, etc.)
* `rbac.test.ts` : 6 cas (hiérarchie, admin cumule tout, refus de
  permissions inférieures, etc.)
* Suite préexistante (FSRS parity, SrsSync, auth) : non régressée.

## Conformité v2 (Phase 7)

| Exigence v2 | État |
|---|---|
| §8.1 Entitlement JWT RS256, vérif offline | ✅ |
| §8.1 Grace period 14j | ✅ |
| §8.1 Anti-piracy (chiffrement premium offline AES-256-GCM) | Phase 8 |
| §8.2 RBAC 5 rôles | ✅ |
| §10.1 Grille freemium 1000–3000 DA | ✅ (2400 DA annuel, 1500 DA semestre, 350 DA/mois) |
| §10.2 Pricing 350/2400/1500 DA | ✅ |
| §10.2 Pack groupe −30% | ✅ |
| §10.2 Codes promo −50/−100% | ✅ |
| §10.4 IAP Apple/Google | Phase 8 (iOS) |
| §6.1 Rate limit 5 OTP / 15min | ✅ via `long` throttle |
| §6.1 Max 3 sessions actives par compte | ✅ (schema user_devices) |
| Webhooks idempotents | ✅ (webhook_events) |

## Hors périmètre (Phases suivantes)

* **Phase 8** : RestSyncRepository Dart, chiffrement AES-256-GCM
  pour les decks premium offline, WorkManager, paywall doux.
* **Phase 10** : Exam timer server-side, FCM push, questions ratées
  → SRS.
* **Phase 11** : CMS Next.js pour modifier `rbac_role` depuis l'UI.

## Vérification

```bash
cd backend
cp .env.example .env
# CHARGILY_API_KEY, CHARGILY_API_SECRET, ADMIN_EMAILS
docker compose up -d postgres
npm install
npm run db:migrate  # applique 0003_billing_rbac.sql
npm test            # unit : billing + rbac
npm run start:dev
```
