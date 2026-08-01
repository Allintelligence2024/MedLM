# MedAnki DZ — Backend (Phases 5-6)

> NestJS 10 + PostgreSQL 16 + Drizzle ORM + `ts-fsrs` 4.7.1
> Status : Phase 5 livrée. Phase 6 (Sync + Content API) livrée en parallèle.

## Stack effective

| Couche | Techno | Justification |
|---|---|---|
| Runtime | Node.js 20 LTS | Écosystème riche, stable |
| Framework | NestJS 10 | Modulaire, DI, décorateurs natifs TypeScript |
| ORM | Drizzle 0.36 | SQL explicite, JSONB natif, migrations vérifiables |
| Validation | Zod 3 | Type-safe runtime, partagé avec la couche de test |
| Auth | @nestjs/jwt + argon2 | RS256, refresh tokens rotatifs |
| Logging | nestjs-pino | Performant, structuré |
| SRS | `ts-fsrs` 4.7.1 | **Alignement strict** avec la lib officielle imposée au backend par la v2 §12 |
| Tests | Vitest | Rapide, ESM natif |

## Démarrer en local

```bash
cd backend
cp .env.example .env
# Éditer DATABASE_URL (docker compose up -d postgres fourni dans docker-compose.yml)
npm install
npm run db:generate   # produit les migrations depuis src/db/schema/
npm run db:migrate    # applique au schéma courant
npm run start:dev
```

L'API est sur `http://localhost:3000/v1`. Health check : `GET /v1/health`.

## Endpoints (Phase 5)

### Auth (`/v1/auth`)
- `POST /signup` — crée un utilisateur, retourne access + refresh
- `POST /login` — email seul pour l'instant (magic link en Phase 6)

### Content (`/v1/content`)
- `GET /decks?module_id=&version_since=&limit=` — delta de decks
- `GET /decks/:id/cards?version_since=&limit=` — delta de cartes d'un deck
- `POST /cards/:id/report` — signalement d'erreur

### SRS Sync (`/v1/srs-sync`)
- `POST /push` — batch de 100 événements max, idempotent
- `GET /pull?since_ms=&limit=` — événements depuis le curseur

### Health (`/v1/health`)
- `GET /` — état DB + uptime

## Endpoints à venir (Phase 6 et au-delà)
- `POST /auth/magic-link` (Resend)
- `POST /auth/google` (OAuth2)
- `POST /auth/refresh`
- `GET /entitlement/jwt` (RS256 signé, vérif offline)
- `POST /webhooks/chargily` (paiements CIB/BaridiMob)
- `POST /exams/attempts` (mock exam avec timer serveur)

## Tests

```bash
npm test                # tests unitaires (FSRS, sync, validation)
npm run test:integration # tests d'intégration (requièrent DATABASE_URL)
```

Les tests `fsrs.parity.test.ts` chargent les golden scenarios
produits par `tools/generate_golden.py` (Phase 1) et vérifient que
**les valeurs TypeScript sont identiques aux valeurs Dart à 1e-9 près**.
C'est la garantie de l'équivalence cross-platform (Phase 6, v2 §14).

## Migrations

Les migrations vivent dans `src/db/migrations/NNNN_nom.sql` et sont
appliquées par `npm run db:migrate` (`src/db/migrate.ts`).

**Point critique** : drizzle ne découvre *pas* les fichiers par listage
du dossier — il lit **exclusivement** `src/db/migrations/meta/_journal.json`
et n'applique que les `tag` qui y figurent, dans l'ordre déclaré. Toute
nouvelle migration doit donc :

1. être nommée avec le numéro suivant, sans trou (`0017_…`) ;
2. recevoir une entrée dans `meta/_journal.json` (`idx` contigu, `when`
   strictement croissant).

`test/unit/migrations_journal.test.ts` vérifie ces deux invariants à
chaque run.

> *Historique* : la série a longtemps sauté le numéro 0011 (0010 → 0012)
> et le journal était absent — `db:migrate` échouait donc systématiquement.
> Les deux points ont été corrigés le 2026-08-01 (renumérotation
> 0012–0017 → 0011–0016, avant toute application en production).

## Variables d'environnement

Cf. `.env.example`. En production :
- `DATABASE_URL` : connection string PostgreSQL (Neon prod)
- `JWT_SIGNING_KEY_PATH` : chemin vers la clé privée RS256
- `NODE_ENV=production`

## Conformité au plan v2

| Exigence v2 | État | Localisation |
|---|---|---|
| NestJS monolithe modulaire | ✅ | `src/app.module.ts` |
| PostgreSQL + JSONB | ✅ | `src/db/schema/content.ts` (cards.content) |
| Schéma complet v2 §7 | ✅ | `src/db/schema/{users,content,srs}.ts` |
| Triggers append-only | ✅ | `src/db/migrations/0002_append_only_triggers.sql` |
| Sync push/pull idempotent | ✅ | `src/srs-sync/srs-sync.service.ts` |
| Fold déterministe | ✅ | `src/common/fsrs/fsrs.engine.ts` |
| Équivalence `ts-fsrs` 4.7.1 | ✅ | `test/unit/fsrs.parity.test.ts` (876 valeurs) |
| Entités pures côté domaine | ✅ | `src/common/fsrs/fsrs.constants.ts` (Rating, CardState…) |
| Validation Zod | ✅ | `src/{auth,srs-sync,content}/*.dto.ts` |
| Helmet + CORS strict | ✅ | `src/main.ts` |
| Health check | ✅ | `src/health/health.controller.ts` |

## Pas livré dans cette PR (Phases suivantes)

- Phase 6 : Magic link, OAuth2 Google, refresh token, OTP SMS
- Phase 7 : Chargily Pay, JWT d'entitlement signé, grace period
- Phase 10 : FCM push, exam timer serveur
- Phase 11 : CMS Next.js
- Phase 12 : Kubernetes manifests, Sentry, métriques Prometheus
