# MedAnki DZ

> Outil de **révision** pour étudiants en médecine. Pas un dispositif
> médical, pas un avis clinique, pas une validation scientifique.

> ⚠️ **NO-GO production** (2026-09-27). Paiements réels, Chargily sandbox,
> cluster K8s et appareil physique ne sont pas qualifiés. Le plan courant
> est [docs/remediation/PLAN.md](docs/remediation/PLAN.md). Les rapports
> historiques ne prouvent pas un lancement.

[![ci](https://github.com/Allintelligence2024/MedLM/actions/workflows/backend-ci.yml/badge.svg)](../../actions/workflows/backend-ci.yml)

---

## Sommaire

- [État et périmètre de livraison](#état-et-périmètre-de-livraison)
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

## État et périmètre de livraison

Le dépôt contient davantage de code que ce qui est aujourd'hui démontré comme
produit fonctionnel. Le prochain objectif est une tranche verticale :
PostgreSQL migré et seedé, authentification, contenu publié, téléchargement
local réel, étude hors ligne et synchronisation SRS multi-appareil.

Les fonctionnalités IA, examens, gamification, partenariats, multi-régions et
optimisations de scale sont conservées hors du release gate du MVP. Voir
[docs/RELEASE_SCOPE.md](docs/RELEASE_SCOPE.md) pour le périmètre gelé, les
bloqueurs connus et la Definition of Done.

## Ce que le dépôt contient (pas ce qui est lancé)

| Domaine | État réel |
|---|---|
| **SRS** | Moteur `ts-fsrs` 4.7.1 + portage Dart, journal append-only. Pas une preuve d'efficacité pédagogique. |
| **Contenu** | Decks versionnés, lectures apprenant = publié + entitlement. wrap-key par appareil : **pas** un chiffrement de bout en bout des cartes. |
| **Examens / IA / ML** | Code présent, hors critère MVP. Provider IA = `mock` par défaut. |
| **Monétisation** | Checkout + entitlement JWT RS256 testés en CI. **Pas** de Chargily sandbox ni de paiement réel. |
| **CMS** | Session HttpOnly + CSRF. Catalogue staff. Upload média = 501 sans R2. |
| **i18n** | FR · AR · EN côté serveur. |

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
dart run build_runner build --delete-conflicting-outputs
flutter analyze && flutter test
```

`app_database.g.dart` n'est pas commité : la CI le génère avant analyze/tests/APK.

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

Un seul workflow actif : [`.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml).
Les badges `mobile-ci.yml` / `cms-ci.yml` / `guards.yml` n'existent pas.

| Job | Contenu |
|---|---|
| static | tsc · eslint · vitest · nest build |
| mobile | `build_runner` Drift · analyze · tests (dont interop RS256) · APK debug |
| integration | PostgreSQL 16, migrations, seed, contrat SQL, parcours métier |
| docker | validation Dockerfiles + `docker build` backend |
| cms | tsc · `next build` |
| verify-scripts | Helm rapprochement, workflows, gardes l10n |

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
| [docs/RELEASE_SCOPE.md](docs/RELEASE_SCOPE.md) | Périmètre gelé du MVP et critères de lancement |
| [PLAN_IMPLEMENTATION.md](PLAN_IMPLEMENTATION.md) | Plan phase par phase (vision d'ensemble) |
| [VERIFY.md](VERIFY.md) | Matrice de validation : quel script prouve quoi |
| [SECURITY.md](SECURITY.md) | Politique de divulgation, périmètre pen test |
| `backend/README.md` · `cms/README.md` | Guides par sous-projet |
| `docs/phases/` | 46 rapports de phase + audits d'architecture |

---

© MedAnki DZ — tous droits réservés. Licence propriétaire (UNLICENSED).
