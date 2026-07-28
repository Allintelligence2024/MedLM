# 🗺️ MedAnki DZ — Plan d'implémentation phase par phase

> Objectif : amener le repo `MedLM` (prototype Android AI Studio) jusqu'à l'architecture cible **MedAnki DZ v2**.
> Méthode : une phase = un lot livrable, testable, mergeable. Je vous rends compte à la fin de chaque phase avant d'enchaîner.

---

## 0. Décision préalable — quel client mobile ?

L'architecture v2 dit **Flutter + Riverpod + Drift**. Le repo existant est **Kotlin + Compose + Room**.

| | **Voie A — Rewrite Flutter** | **Voie B — Converger en Kotlin** (recommandé) |
|---|---|---|
| Conformité au doc v2 | 100 % | ~90 % (client natif au lieu de Flutter) |
| Travail jeté | ~4 170 lignes Kotlin, 7 écrans | 0 |
| Temps avant 1re valeur | Long (tout refaire) | Court (on capitalise) |
| iOS plus tard | Gratuit | Nécessite un 2e client |
| Équivalences | Riverpod→ViewModel/StateFlow · Drift→Room · Dio→Retrofit (déjà en deps) | idem |

**Ma recommandation : Voie B.** La v1 est Android-only de toute façon (le doc le dit : « iOS reporté après product-market fit »). Toutes les décisions *structurantes* de la v2 — FSRS-5 réel, event log append-only, sync déterministe, entitlement JWT signé, contenu versionné, backend NestJS/Postgres — sont **indépendantes du framework UI** et seront implémentées à l'identique. On ne perd que le nom des libs.

Si vous choisissez la Voie A, le plan ci-dessous reste valable : seules les phases 1–4 et 8 changent de langage (Dart au lieu de Kotlin), les phases backend (5, 6, 7) sont identiques.

---

## 1. Vue d'ensemble des phases

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 1  Fondations SRS          FSRS-5 réel + event log + tests        │  CLIENT
│  PHASE 2  Persistance robuste     Migrations, outbox, multi-user, deck   │  CLIENT
│  PHASE 3  Contenu externalisé     JSON versionné, source_meta, légal     │  CLIENT
│  PHASE 4  Architecture propre     Domain layer, use cases, DI            │  CLIENT
│  ────────────────────────────────────────────────────────────────────    │
│  PHASE 5  Backend socle           NestJS + Postgres + Prisma + Auth      │  SERVEUR
│  PHASE 6  Sync + Content API      push/pull, delta decks, fold serveur   │  SERVEUR
│  PHASE 7  Billing + Entitlement   JWT RS256, Chargily, grace period      │  SERVEUR
│  ────────────────────────────────────────────────────────────────────    │
│  PHASE 8  Intégration client      Auth, sync engine, paywall, offline    │  CLIENT
│  PHASE 9  Gamification corrigée   XP habitude, streak réel, badges       │  CLIENT
│  PHASE 10 Exams & Notifications   Timer serveur, FCM, réinjection SRS    │  LES 2
│  PHASE 11 CMS éditorial           Next.js, workflow, RBAC, audit         │  CMS
│  PHASE 12 CI/CD & Observabilité   GH Actions, Sentry, KPIs SRS           │  INFRA
└──────────────────────────────────────────────────────────────────────────┘
```

Le doc v2 conclut : *« Commencer par la Spec Sync SRS — c'est le composant le plus critique. »*
Le plan respecte cet ordre : **Phases 1–2 = le cœur SRS et son journal**, tout le reste s'y branche.

---

## 2. Détail des phases

### 🔴 PHASE 1 — Fondations SRS : FSRS-5 réel
*Le composant qu'on ne peut pas corriger après coup.*

- Remplacer `FsrsEngine` heuristique par une **implémentation FSRS-5 complète** : 19 paramètres `w[]`, formules officielles `S'` (recall/forget), `D'` avec mean reversion, `retrievability` avec facteur 0.9, `requestRetention` configurable.
- `SchedulingCards` : les 4 intervalles Again/Hard/Good/Easy affichés sur les boutons.
- Machine à états NEW → LEARNING → REVIEW ⇄ RELEARNING avec steps d'apprentissage (1min / 10min / 1j).
- **`ReviewEvent`** : id UUIDv7 (time-ordered), cardId, userId, deviceId, rating, durationMs, cardType, reviewedAt, examMode.
- **`FsrsFold.fold(events) → SrsCardState`** : fonction pure, déterministe, rejouable. C'est la règle d'or de la v2.
- Pondération QCM à 0.85 (recognition < recall).
- **Tests : 50+ scénarios déterministes** + property test « fold(events) est idempotent et indépendant de l'ordre d'insertion ».

**Livrable :** moteur SRS scientifiquement correct et prouvé par tests. **Rien d'autre ne bouge.**

---

### 🟠 PHASE 2 — Persistance robuste
- **Migrations Room réelles** (suppression de `fallbackToDestructiveMigration` — actuellement toute la progression est perdue à chaque changement de schéma).
- Multi-utilisateur : `userId` partout, clé primaire `(userId, cardId)` sur `srs_card_state`.
- `review_logs` **strictement append-only** (INSERT ABORT, jamais REPLACE) + index `(userId, reviewedAt)`.
- Nouvelles tables : `outbox_events`, `sync_cursor`, `deck_meta` (version, isPremium, isOfflineReady), `entitlement` (cache local), `study_sessions`.
- Index critiques : `srs_card_state(userId, nextReviewDate)` pour la due queue.
- Tests de migration Room.

**Livrable :** base locale conforme au schéma v2, prête pour la sync, zéro perte de données.

---

### 🟡 PHASE 3 — Contenu externalisé & légal
- Sortir les 7 cartes en dur du code → **fichiers JSON versionnés** bundlés dans `assets/` (format identique au JSONB serveur : `content`, `source_meta`, `tags`, `version`, `status`).
- Structure `content` bilingue FR/EN + `explanation` + `media[]` avec alt text.
- **`source_meta` obligatoire** : `source_type` (original|inspired|partnership), faculty, year, `can_distribute_offline`, license. Un parser qui **refuse** une carte sans `source_type` valide.
- Deck démo gratuit 80 cartes vs decks premium.
- Loader avec checksum + upgrade par version de deck.
- Inverser la langue par défaut : **FR principal**, EN secondaire (le doc v2 le spécifie ; le repo est actuellement EN-first).

**Livrable :** le contenu devient un actif versionné et juridiquement traçable, plus du code.

---

### 🟢 PHASE 4 — Architecture propre (Clean)
- Création de la **couche domain** : entities pures (`Flashcard`, `SRSCardState`, `ReviewEvent`), sans annotation Room.
- **Use cases** : `BuildStudyQueueUseCase`, `RecordReviewUseCase`, `FetchDueCardsUseCase`, `SyncOutboxUseCase`, `ValidateEntitlementUseCase`, `StartMockExamUseCase`, `SubmitReportUseCase`, `DownloadDeckUseCase`.
- **Interfaces de repository** (`ICardRepository`, `ISRSRepository`, `IReviewLogRepository`…) + implémentations data.
- Injection de dépendances (Hilt) — remplace le `MedViewModelFactory` manuel.
- Éclatement du `MedViewModel` monolithique en ViewModels par écran.
- Règles de session : 10 nouvelles cartes/jour, plafond 100 revues, bury siblings, leech à 8 lapses.

**Livrable :** codebase testable et extensible, équivalent Kotlin de l'archi Clean+Riverpod du doc.

---

### 🔵 PHASE 5 — Backend socle
- `backend/` : **NestJS 10** monolithe modulaire, TypeScript, structure par modules.
- **PostgreSQL 16 + Prisma** : schéma complet v2 (users, entitlements, user_devices, promo_codes, programmes, modules, decks, cards JSONB, card_reports, card_versions, srs_card_state, review_logs, sync_cursors, exam_templates, exam_attempts, study_sessions) + tous les index de la section 7.
- **Auth module** : Google OAuth2, email magic link, JWT access 15 min + refresh rotatif 30 j, rate limiting.
- Validation **Zod** sur tous les inputs, guards, CORS, HSTS.
- `docker-compose` (Postgres + Redis + API) pour le dev local.
- Tests Jest + Supertest.

**Livrable :** API qui démarre, s'authentifie, avec le schéma de données complet.

---

### 🟣 PHASE 6 — Sync + Content API
- **SRS Sync module** : `POST /sync/push` (idempotent par event.id, batch max 100), `GET /sync/pull?since=cursor`, `GET /sync/state`.
- Portage **`ts-fsrs`** côté serveur + test d'équivalence stricte Kotlin ↔ TypeScript (même events → même état, à la décimale près). Point critique.
- **Content module** : `GET /decks?version_since=`, `GET /decks/:id/cards` (delta par version), `GET /cards/search`, `POST /cards/:id/report`, cache Redis + invalidation à la publication.
- Tests de merge multi-device : simulation 2 devices offline → réconciliation sans perte.

**Livrable :** le protocole de sync spécifié, implémenté et prouvé sans perte de données.

---

### 🟤 PHASE 7 — Billing & Entitlement
- Interface `IPaymentProvider` + `ChargilyPayProvider` (CIB/BaridiMob) + `PromoCodeProvider`, stubs Store iOS/Android.
- Webhooks idempotents, réconciliation.
- **Entitlement JWT RS256** : payload `{userId, plan, expiresAt, graceUntil, allowedDecks[], deviceId}`, TTL 24 h, vérifiable offline via clé publique.
- Grace period 14 j, max 3 sessions actives.
- Grille freemium et pricing du doc (350 DA/mois, 2400 DA/an, 1500 DA/6 mois).

**Livrable :** le serveur est l'unique source de vérité du premium.

---

### ⚫ PHASE 8 — Intégration client ↔ serveur
- Couche réseau Retrofit/OkHttp (déjà en deps, jamais utilisée) + intercepteurs auth/retry.
- Écrans Auth (Google + magic link), onboarding (faculté, année, langue).
- **Sync engine** : WorkManager (foreground app / WiFi / 15 min bg), push outbox compressé, pull par cursor, merge `fold()`, delta contenu, refresh entitlement.
- Vérification entitlement offline (clé publique embarquée) + `EntitlementGate` composable + paywall doux (J7–J14).
- Téléchargement de decks premium chiffrés AES-256-GCM, clé dérivée `(userId + deviceId)`, stockage token en Android Keystore.
- **Test d'acceptation non négociable :** ouvrir l'app en mode avion, réviser 50 cartes, fermer — zéro appel réseau bloquant.

**Livrable :** l'app complète offline-first, synchronisée, avec premium sécurisé.

---

### 🟩 PHASE 9 — Gamification corrigée
- **Supprimer les +15 XP par carte quel que soit le rating** (anti-pattern explicitement interdit par la v2 — récompense actuellement le clic « Easy » abusif).
- XP sur l'habitude : session du jour complétée +30, carte révisée +3, QCM +4, mock exam +50, multiplicateurs streak x1.2 (J7) / x1.5 (J30). Plafond 100 cartes/jour.
- Streak **réellement calculé** (aujourd'hui : valeur de démo figée à 5) + 2 freeze/mois + alerte « streak en danger ».
- Niveaux P1 → P2 → Interne → Résident → Praticien. Badges. Leaderboard hebdo opt-in, pseudonyme.

**Livrable :** gamification alignée sur l'efficacité SRS, pas contre elle.

---

### 🟦 PHASE 10 — Exams & Notifications
- Exam module serveur : templates, génération par filtres, **timer server-side**, scoring, rapport.
- Questions ratées → cartes suggérées au scheduler (dedup, flag `from_exam`, bury si déjà en deck).
- `exam_mode = true` → événements enregistrés mais **exclus du fold** SRS.
- Notifications FCM : `due_reminder`, `streak_danger`, `deck_updated`, fenêtre 8h–22h, Bull retry x3.

---

### 🟪 PHASE 11 — CMS éditorial (Next.js 14)
- CRUD cartes, éditeur bilingue, upload media R2.
- Workflow `draft → review → approved → published → retired` + bump de version + snapshot `card_versions`.
- Checklist qualité bloquante (atomicité, source, reformulation, explication clinique, terme EN, alt text, distracteurs expliqués).
- RBAC 5 rôles (student/author/medical_reviewer/editor/admin), audit log complet.
- Gestion des `card_reports` utilisateurs, takedown flag par deck.

---

### ⬛ PHASE 12 — CI/CD & Observabilité
- GitHub Actions : lint, typecheck, tests unitaires (**suite FSRS bloquante**), tests d'intégration, tests Android, build APK, deploy staging/prod.
- Dockerfile + compose prod, Nginx rate limit.
- Sentry (backend + Android), Crashlytics.
- Dashboard KPIs SRS : sessions/jour, due cleared rate, retention J7/J14/J30, forecast accuracy, leeches par deck, funnel free→premium.

---

## 3. Ordre de dépendance

```
P1 ──► P2 ──► P3 ──► P4 ──┐
                          ├──► P8 ──► P9 ──► P10 ──► P12
P5 ──► P6 ──► P7 ─────────┘                  P11 ──┘
```
- **P1 est bloquante pour tout** : toute donnée SRS produite avant un vrai FSRS sera à jeter.
- P5–P7 (backend) peuvent démarrer en parallèle de P3–P4 si vous voulez avancer sur deux fronts.
- P11 (CMS) est indépendant après P5.

## 4. Règles de travail que je m'impose

1. **Une phase = un commit propre** sur `arena/019fa95e-medlm`, avec compte rendu écrit avant de passer à la suite.
2. **Aucun changement de comportement non demandé** : je ne touche pas aux écrans dans les phases 1–2.
3. **Tests d'abord sur le SRS** : pas de merge de la P1 sans les 50 scénarios verts.
4. **Je m'arrête et je vous demande** dès qu'une décision produit apparaît (prix, wording FR, choix de provider…).
5. Je vous dis à chaque fin de phase : ce qui est fait, ce qui reste, ce qui a changé par rapport au doc v2 et pourquoi.

---

## 5. Suggestion de démarrage

**Phase 1**, sans hésitation. C'est le point de non-retour identifié par le doc lui-même : le moteur actuel (`stability * 1.3f`, `* 0.4f`…) n'est pas FSRS, et chaque jour d'utilisateurs réels rend la migration plus coûteuse.
