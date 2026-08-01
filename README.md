# MedAnki DZ

> **Révise mieux, retiens plus, réussis en 1ʳᵉ année.**
> Application de révision par répétition espacée (FSRS-5) pour les
> étudiants en médecine algériens : flashcards, banque de QCM, examens
> blancs, mode hors-ligne d'abord.

[![backend-ci](https://github.com/Allintelligence2024/MedLM/actions/workflows/backend-ci.yml/badge.svg)](../../actions/workflows/backend-ci.yml)
[![mobile-ci](https://github.com/Allintelligence2024/MedLM/actions/workflows/mobile-ci.yml/badge.svg)](../../actions/workflows/mobile-ci.yml)
[![cms-ci](https://github.com/Allintelligence2024/MedLM/actions/workflows/cms-ci.yml/badge.svg)](../../actions/workflows/cms-ci.yml)
[![guards](https://github.com/Allintelligence2024/MedLM/actions/workflows/guards.yml/badge.svg)](../../actions/workflows/guards.yml)

---

## Sommaire

- [Ce que fait le produit](#ce-que-fait-le-produit)
- [Architecture](#architecture)
- [Arborescence du dépôt](#arborescence-du-dépôt)
- [Démarrage rapide](#démarrage-rapide)
  - [Tout en Docker](#tout-en-docker-le-plus-court)
  - [Backend](#backend)
  - [Mobile](#mobile)
  - [CMS](#cms)
- [Matrice de gardes](#matrice-de-gardes)
- [Intégration continue](#intégration-continue)
- [Conventions](#conventions)
- [Documentation](#documentation)

---

## Ce que fait le produit

| Domaine | Contenu |
|---|---|
| **SRS** | FSRS-5 réel (`ts-fsrs` 4.7.1 côté serveur, portage Dart vérifié par parité stricte côté client), event log **append-only**, sync déterministe hors-ligne d'abord |
| **Contenu** | Decks versionnés, chiffrés à la livraison (wrap-key par appareil), Content Policy appliquée par CI (sources obligatoires, 0 promesse médicale) |
| **Examens** | Templates de QCM, tentatives chronométrées **côté serveur**, événements anti-triche, prédicteur de score ML |
| **IA** | Indices adaptatifs, dictée vocale → carte, tuteur conversationnel — provider-agnostique (`mock` par défaut, tout endpoint OpenAI-compatible ensuite), quotas journaliers en base |
| **Gamification** | XP, streaks (avec gel), badges, classements |
| **Monétisation** | Chargily (paiement DZ), entitlement JWT vérifiable **hors-ligne**, grace period 14 j, packs de groupe |
| **i18n** | FR · AR · EN — parité vérifiée par test côté serveur |

## Architecture

```
┌───────────────────┐        ┌────────────────────────────────────────┐
│  Mobile (Flutter) │        │            Backend (NestJS 10)         │
│  Drift/SQLite     │◀──────▶│  REST  /v1/*        GraphQL /v2/graphql│
│  source de vérité │  sync  │  Drizzle ORM ──▶ PostgreSQL 16         │
│  hors-ligne       │  delta │                └▶ réplicas lecture     │
└───────────────────┘        │  Redis (cache, quotas)                 │
                             │  Providers IA (mock | HTTP)            │
┌───────────────────┐        └────────────────────────────────────────┘
│  CMS (Next.js 14) │───────────────────▲
│  édition contenu  │      REST /v1     │
└───────────────────┘                   │
┌───────────────────┐                   │
│  site/ (landing)  │  statique, 0 tracker
└───────────────────┘
```

Principes structurants, valables partout :

1. **Hors-ligne d'abord** — le client est la source de vérité de sa
   session ; le serveur réconcilie des deltas idempotents.
2. **Append-only** — les journaux de révision ne sont ni modifiés ni
   supprimés (triggers PostgreSQL, `0002_append_only_triggers.sql`).
3. **Provider-agnostique** — aucun SDK d'éditeur d'IA en dépendance
   dure ; tout passe par une interface + implémentation `mock`.
4. **Vérifiable** — chaque invariant critique a un script qui le prouve
   (voir [VERIFY.md](VERIFY.md)).

## Arborescence du dépôt

| Chemin | Rôle |
|---|---|
| `backend/` | API NestJS 10 (REST `/v1`, GraphQL `/v2/graphql`), Drizzle, migrations SQL |
| `mobile/` | Application Flutter (domain / data / core / ui), moteur FSRS Dart |
| `cms/` | Back-office Next.js 14 pour les auteurs de contenu |
| `site/` | Landing page statique trilingue |
| `store/` | Fiches et checklists de publication (Play Store / App Store) |
| `deploy/` | Kubernetes (base + overlays régionaux), Helm, scripts |
| `tools/` | Gardes-fous exécutables (parité FSRS, migrations, sécurité, contenu) |
| `tests/` | E2E Playwright + tests de charge |
| `docs/phases/` | Rapports de phase historiques et audits |

## Démarrage rapide

Prérequis : **Node 22**, **Python 3.12**, **Flutter stable** (≥ 3.4),
**Docker** (facultatif mais recommandé).

### Tout en Docker (le plus court)

```bash
# Clés RS256 nécessaires au backend (jamais commitées)
mkdir -p backend/keys
openssl genrsa -out backend/keys/jwt-private.pem 2048
openssl rsa -in backend/keys/jwt-private.pem -pubout -out backend/keys/jwt-public.pem

docker compose up --build
# backend  → http://localhost:3000/v1/healthz
# graphql  → http://localhost:3000/v2/graphql
# cms      → http://localhost:3001
```

### Backend

```bash
cd backend
cp .env.example .env          # ajuster DATABASE_URL au besoin
npm ci
docker compose -f ../docker-compose.yml up -d postgres redis
npm run db:migrate            # applique src/db/migrations (journal drizzle)
npm run start:dev
```

```bash
npm run typecheck             # tsc --noEmit
npm run lint
npm run test                  # unitaire (vitest)
npm run test:integration      # nécessite une vraie PostgreSQL
```

> **API** : REST sous le préfixe `/v1`, GraphQL sous `/v2/graphql`
> (explicitement **exclu** du préfixe global — cf. `src/configure-app.ts`,
> verrouillé par `test/integration/routing.test.ts`).

### Mobile

```bash
cd mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # code Drift généré
flutter run
```

Le code généré (`*.g.dart`) **est commité** : le dépôt reste compilable
sans lancer `build_runner`, et la CI vérifie qu'il est à jour.

```bash
flutter analyze
flutter test
```

### CMS

```bash
cd cms
npm ci
npm run dev                   # http://localhost:3001
```

## Matrice de gardes

Le détail « quel script prouve quoi » vit dans **[VERIFY.md](VERIFY.md)**.
Résumé exécutable :

```bash
./tools/verify_all.sh              # parité FSRS, migrations, contenu, livrables
./tools/scripts/phase13_checks.sh  # lockfiles, sécurité, syntaxe, gardes 19/20
npm run e2e                        # Playwright (CMS + backend seedé)
```

| Niveau | Ce qui est prouvé |
|---|---|
| 0 | 0 secret en dur, lockfiles cohérents, Content Policy, syntaxe |
| 1 | Moteur SRS : parité Dart ↔ Python, migrations, logique du dépôt |
| 2 | Parité stricte avec `ts-fsrs` officiel (855 primitives + séquences) |
| 3 | Landing, fiches stores, périmètre pen test, multi-régions, GraphQL, ML |

## Intégration continue

> ⚠️ **Les workflows attendent leur activation** : ils vivent dans
> [`ci/workflows/`](ci/workflows/) et doivent être déplacés vers
> `.github/workflows/` par un compte disposant de la permission
> `workflows` — voir [ci/README.md](ci/README.md).

| Workflow | Déclencheur | Contenu |
|---|---|---|
| `backend-ci.yml` | `backend/**` | tsc · eslint · vitest · nest build · **intégration sur PostgreSQL 16** (schéma jetable) · `docker build` |
| `mobile-ci.yml` | `mobile/**` | format · analyze · `build_runner` (fraîcheur du code généré) · `flutter test` · APK debug |
| `cms-ci.yml` | `cms/**` | tsc · next lint · next build · `docker build` |
| `guards.yml` | tout push/PR | `verify_all.sh` · `phase13_checks.sh` · audit sécurité · E2E Playwright |

## Conventions

- **Aucun secret dans le dépôt.** Les clés RS256, tokens Chargily et
  clés IA passent par l'environnement / un secret manager.
- **Aucun binaire commité** (l'audit sécurité échoue sinon).
- **Migrations séquentielles** : `NNNN_nom.sql` + entrée correspondante
  dans `src/db/migrations/meta/_journal.json` (drizzle ne lit *que* ce
  journal). Voir `backend/README.md` § Migrations.
- **Commentaires en français**, code en anglais — comme le reste du dépôt.
- Vulnérabilités : voir [SECURITY.md](SECURITY.md).

## Documentation

| Fichier | Contenu |
|---|---|
| [PLAN_IMPLEMENTATION.md](PLAN_IMPLEMENTATION.md) | Plan phase par phase (vision d'ensemble) |
| [VERIFY.md](VERIFY.md) | Matrice de validation : quel script prouve quoi |
| [SECURITY.md](SECURITY.md) | Politique de divulgation, périmètre pen test |
| `backend/README.md` · `cms/README.md` | Guides par sous-projet |
| `docs/phases/` | 46 rapports de phase + audits d'architecture |

---

© MedAnki DZ — tous droits réservés. Licence propriétaire (UNLICENSED).
