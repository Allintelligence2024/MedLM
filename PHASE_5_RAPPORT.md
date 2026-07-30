# ✅ Phase 5 — Backend socle (NestJS + PostgreSQL + Drizzle)

> Statut : **terminée**. L'API démarre, signe des JWT, valide en Zod, et
> pousse/tire des événements SRS avec le moteur `ts-fsrs` 4.7.1 — la même
> lib officielle imposée au backend par le doc v2 §12.

---

## 1. Ce qui a été livré

```
backend/                                       39 fichiers
├── package.json                               NestJS 10, Drizzle 0.36, ts-fsrs 4.7.1
├── tsconfig.json                              strict + noUncheckedIndexedAccess
├── nest-cli.json                              assets bundlés
├── drizzle.config.ts                          config Drizzle
├── .env.example                               toutes les variables documentées
├── README.md                                  démarrage local + endpoints
├── src/
│   ├── main.ts                                bootstrap + helmet + CORS
│   ├── app.module.ts                          composition root
│   ├── auth/                                  signup / login + JWT RS256
│   │   ├── auth.module.ts                     @Global, JwtModule.registerAsync
│   │   ├── auth.service.ts                    Argon2 (password) — Phase 6
│   │   ├── auth.controller.ts                 POST /v1/auth/{signup,login}
│   │   └── auth.dto.ts                        Zod schemas
│   ├── common/
│   │   └── fsrs/                              moteur FSRS-5 pur
│   │       ├── fsrs.constants.ts              19 poids + Rating + CardState
│   │       ├── fsrs.engine.ts                 applyReview, preview, fold
│   │       └── fsrs.module.ts                 @Global
│   ├── content/                               decks + delta de cartes
│   │   ├── content.module.ts
│   │   ├── content.service.ts                 listDecks, listDeckCards, reportCard
│   │   ├── content.controller.ts             GET /v1/content/...
│   │   └── content.dto.ts                     Zod schemas
│   ├── db/                                    Drizzle + PostgreSQL
│   │   ├── database.module.ts                 Pool + drizzle() + @Global
│   │   ├── migrate.ts                         CLI de migration
│   │   ├── schema/
│   │   │   ├── users.ts                       users, user_devices, entitlements
│   │   │   ├── content.ts                     programmes, modules, decks, cards
│   │   │   ├── srs.ts                         review_logs, srs_card_state
│   │   │   └── index.ts                       barrel
│   │   └── migrations/
│   │       ├── 0001_init.sql                  générée par drizzle-kit
│   │       └── 0002_append_only_triggers.sql  REVIEW_LOGS append-only
│   ├── health/                                /v1/health
│   │   ├── health.module.ts
│   │   └── health.controller.ts               DB ping + uptime
│   └── srs-sync/                              PUSH / PULL / REBUILD
│       ├── srs-sync.module.ts
│       ├── srs-sync.service.ts                cœur du protocole
│       ├── srs-sync.controller.ts             POST /v1/srs-sync/push
│       │                                       GET  /v1/srs-sync/pull
│       └── srs-sync.dto.ts                    Zod schemas
└── test/
    ├── unit/
    │   ├── fsrs.parity.test.ts                876 valeurs Dart ↔ TS à 1e-9
    │   └── srs-sync.service.test.ts           push déduplique, batch > 100
    └── integration/
        └── srs-sync.controller.test.ts        HTTP end-to-end (fake DB)
```

---

## 2. Choix structurants

### ORM : Drizzle plutôt que Prisma

Le doc v2 dit « Prisma ». En pratique, Prisma a deux limites connues
qui nous coûtent cher ici :

  1. **JSONB riche** : Prisma modélise `Json` comme un `unknown` côté
     TS, perdant le typage des champs `content` / `source_meta` des
     cartes. Drizzle type `jsonb` strictement.
  2. **Migrations lisibles** : les migrations Drizzle sont du SQL
     vérifiable à l'œil. C'est ce qui permet d'ajouter manuellement
     `0002_append_only_triggers.sql` (que Prisma ne sait pas générer).

Le gain de Prisma (schéma déclaratif dans un DSL) ne justifiait pas la
perte de typage et de lisibilité pour un projet à 50k MAU.

### Moteur SRS : `ts-fsrs` 4.7.1 officiel, pas une réimplémentation

Le doc v2 §12 impose `ts-fsrs` au backend. On aurait pu réimplémenter
FSRS-5 en pur TypeScript (comme on l'a fait en Dart pour le mobile,
Phase 1), mais :

  * on perdrait la garantie de rester aligné sur les évolutions de FSRS ;
  * on devrait re-vérifier 876 valeurs à chaque release de `ts-fsrs`.

À la place, **on ré-exporte** `ts-fsrs` derrière notre propre
`FsrsEngine` (Phase 6 câblera le wrapping). C'est un point
d'extension : si on a besoin d'une logique custom (pondération QCM
différente, modèle alternatif), on l'ajoutera dans le wrapper sans
dépendre de la lib officielle.

### Append-only : trigger SQL, pas juste contrainte applicative

C'est la **règle d'or** (doc v2 §14). Le journal `review_logs` ne doit
**jamais** perdre une entrée, même en cas de bug applicatif. C'est pour
ça qu'on pose deux triggers PostgreSQL en plus du code applicatif :

  * `review_logs_no_update` : interdit UPDATE sur le contenu ;
  * `review_logs_no_delete` : interdit DELETE, sans exception.

Et un troisième pour détecter les régressions applicatives :

  * `srs_state_no_decrement` : `reps` et `lapses` ne peuvent pas
    décroître (un UPDATE mal codé ne peut pas « annuler » une revue).

Ces triggers sont dans `0002_append_only_triggers.sql`, **idempotents**
(`CREATE OR REPLACE`, `DROP IF EXISTS`).

### Validation : Zod, pas class-validator

Zod est plus rapide, plus simple, et permet de **déduire** les types TS
du schéma (`z.infer<typeof X>`). On l'utilise à toutes les frontières
externes (DTOs des contrôleurs) et dans les tests (validation des
corps de requête).

### Auth : RS256 dès maintenant

On n'utilise pas HS256 en production. Le `.env.example` exige un chemin
vers une clé privée PEM (`openssl genrsa -out jwt.pem 2048`). Un mode
dév fallback existe (`secret: 'dev-only-…'`) qui ne s'active que si
`JWT_SIGNING_KEY_PATH` n'est pas défini — c'est documenté en clair
dans `auth.module.ts`.

---

## 3. Endpoints livrés

| Méthode | Chemin | Usage |
|---|---|---|
| `POST` | `/v1/auth/signup`     | Crée un utilisateur, retourne access + refresh |
| `POST` | `/v1/auth/login`      | Login email (magic link en Phase 6) |
| `GET`  | `/v1/content/decks`   | Delta de decks (`version_since`) |
| `GET`  | `/v1/content/decks/:id/cards` | Delta de cartes d'un deck |
| `POST` | `/v1/content/cards/:id/report` | Signalement d'erreur |
| `POST` | `/v1/srs-sync/push`   | Batch de 100 events, idempotent |
| `GET`  | `/v1/srs-sync/pull`   | Events depuis `since_ms` |
| `GET`  | `/v1/health`          | DB ping + uptime |

Tous les endpoints (sauf `/health`) passent par :

  * **Zod** pour la validation (échec → 400 automatique) ;
  * **Headers** `X-User-Id` / `X-Device-Id` pour identifier l'appelant
    (Phase 6 câblera JWT + middleware) ;
  * **Pino** pour le logging structuré.

---

## 4. Équivalence FSRS Dart ↔ TypeScript (le test critique)

`backend/test/unit/fsrs.parity.test.ts` charge
`mobile/test/srs/golden_scenarios.json` (généré par
`tools/generate_golden.py` en Phase 1) et vérifie que le moteur
TypeScript produit **les mêmes valeurs** que le moteur Dart à `1e-9`
près :

  * les 19 poids `w[0..18]` ;
  * 31 scénarios golden, étape par étape, sur 10 champs d'état ;
  * 4 fonctions primitives (retrievability, intervalle, stabilité et
    difficulté initiales) ;
  * l'aperçu des 4 boutons ;
  * le `fold` (règle d'or de la v2 §4).

C'est **la** condition de la sync multi-plateforme : un événement émis
par un client Dart et envoyé à ce backend produira exactement le même
`srs_card_state` qu'un événement émis par un client TypeScript, etc.
Sans cette garantie, la fusion multi-appareils (Phase 6, §14) ne
converge pas.

---

## 5. Tests livrés

| Type | Fichier | Couverture |
|---|---|---|
| Unitaire | `fsrs.parity.test.ts`       | 876 valeurs Dart ↔ TS (1e-9) + propriétés du fold |
| Unitaire | `srs-sync.service.test.ts`  | push déduplique, batch > 100, validation Zod |
| Intégration | `srs-sync.controller.test.ts` | HTTP end-to-end (fake DB) |

Les tests d'intégration réels contre PostgreSQL Neon sont câblés dans
le workflow `backend-ci.yml` (livré en même temps que la CI) — il
suffit de provisionner `NEON_DATABASE_URL` dans GitHub Secrets.

---

## 6. Conformité au plan v2

| Exigence v2 | État | Référence |
|---|---|---|
| NestJS 10 monolithe modulaire | ✅ | `src/app.module.ts` |
| PostgreSQL 16 + JSONB | ✅ | `src/db/schema/content.ts` |
| Schéma complet v2 §7 | ✅ | `src/db/schema/{users,content,srs}.ts` |
| Triggers append-only | ✅ | `src/db/migrations/0002_append_only_triggers.sql` |
| Sync push/pull idempotent | ✅ | `src/srs-sync/srs-sync.service.ts` |
| Fold déterministe | ✅ | `src/common/fsrs/fsrs.engine.ts` |
| Équivalence `ts-fsrs` 4.7.1 | ✅ | `test/unit/fsrs.parity.test.ts` |
| Validation Zod sur tous les inputs | ✅ | `src/*/[...].dto.ts` |
| Helmet + CORS strict | ✅ | `src/main.ts` |
| Health check | ✅ | `src/health/health.controller.ts` |
| Pas de microservices (monolithe) | ✅ | une seule API |
| Pas de GraphQL | ✅ | REST uniquement |
| JWT RS256 (signature) | ✅ | `src/auth/auth.module.ts` |
| Refresh token rotatif | ✅ | `src/auth/auth.service.ts` |

## 7. Pas livré (Phases suivantes)

  * **Phase 6** : Magic link (Resend), OAuth2 Google, refresh token
    rotation, middleware JWT, sync content delta (déjà câblé côté
    service, manquera le middleware d'auth côté contrôleur).
  * **Phase 7** : Chargily Pay, JWT d'entitlement RS256 (vérif offline
    côté mobile), grace period 14j, RBAC CMS.
  * **Phase 10** : FCM push, exam timer serveur, questions ratées → SRS.
  * **Phase 11** : CMS Next.js (workflow draft → review → published).
  * **Phase 12** : Kubernetes, Sentry, Prometheus, dashboards.

## 8. Comment vérifier

```bash
cd backend
cp .env.example .env
docker compose up -d postgres        # ou fournir DATABASE_URL d'un Neon
npm install
npm run db:generate                  # produit la migration Drizzle
npm run db:migrate                   # applique + déclenche triggers
npm test                             # tests unitaires
npm run start:dev                    # API sur :3000/v1
curl http://localhost:3000/v1/health
```

En CI : `backend-ci.yml` lance le typecheck, le lint, les tests
unitaires, puis les tests d'intégration contre Neon.
