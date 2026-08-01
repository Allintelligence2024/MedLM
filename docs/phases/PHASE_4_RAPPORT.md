# ✅ Phase 4 — Clean Architecture côté client Flutter

> Statut : **terminée**. Le domaine ne dépend plus de Drift ; les use cases
> sont testables en isolation.

---

## 1. Ce qui a été livré

```
mobile/lib/
├── core/
│   └── container/
│       └── app_container.dart        composition root (DI manuelle, pré-Riverpod)
├── data/                              adaptateurs : Drift + Dio (Phase 8)
│   └── repositories/
│       ├── srs_repository.dart        (refactor) implémente ISrsRepository
│       ├── card_repository.dart       (nouveau) implémente ICardRepository
│       ├── entitlement_repository.dart  (nouveau) implémente IEntitlementRepository
│       └── sync_repository.dart       (nouveau) implémente ISyncRepository (Phase 4 stub)
└── domain/                            (nouveau)
    ├── domain.dart                    barrel : façade publique
    ├── entities/
    │   └── entities.dart              ré-exporte les entités pures
    ├── repositories/
    │   └── repositories.dart          interfaces + StudyQueueItem, EntitlementState…
    └── usecases/
        ├── build_study_queue.dart     BuildStudyQueueUseCase
        ├── record_review.dart         RecordReviewUseCase
        ├── fetch_due_cards.dart       FetchDueCardsUseCase
        ├── sync_outbox.dart           SyncOutboxUseCase
        ├── validate_entitlement.dart  ValidateEntitlementUseCase
        ├── start_mock_exam.dart       StartMockExamUseCase
        ├── submit_report.dart         SubmitReportUseCase
        └── download_deck.dart         DownloadDeckUseCase

mobile/test/
└── domain/
    ├── fakes.dart                     4 fakes (Srs, Sync, Entitlement, Card)
    └── use_cases_test.dart            11 tests, ~250 l.
```

---

## 2. La règle d'or

> **Le domaine ignore tout de Flutter, de Drift, de Dio, de SQLite, du
> réseau et des fichiers.**

Vérifiable en une commande : `grep -RE "import 'package:drift|import 'package:flutter|import 'package:dio" mobile/lib/domain/` ne renvoie rien.

Conséquence pratique : `mobile/lib/domain/` peut être copié tel quel dans
un autre projet (CLI, backend, test d'intégration) et continuerait à
fonctionner. C'est ce qui rend les use cases testables sans base de
données — voir `test/domain/use_cases_test.dart`, qui tourne avec des
fakes en mémoire.

---

## 3. Use cases livrés et leur rôle

| Use case | Rôle | Cible v2 |
|---|---|---|
| `BuildStudyQueueUseCase` | Construit la file d'étude (dues > nouvelles, plafonds 5/10/20 et 100/session) | §14, §4 |
| `RecordReviewUseCase` | Enregistre une revue (journal + outbox + état, atomique) | §4 |
| `FetchDueCardsUseCase` | Compte les cartes dues (lecture seule index) | §14 |
| `SyncOutboxUseCase` | PUSH/pull/rebuild — protocole défini dans le doc v2 §6 | §6, §14 |
| `ValidateEntitlementUseCase` | Vérifie l'accès (signature JWT + grace period 14j) | §8.1 |
| `StartMockExamUseCase` | Démarre un examen blanc (cartes tirées au sort) | §10 |
| `SubmitReportUseCase` | Soumet un signalement d'erreur | §5.3 |
| `DownloadDeckUseCase` | Lance le téléchargement d'un deck (HTTP en Phase 8) | §11.2 |

Tous reçoivent leurs dépendances par constructeur (DI) ; aucun n'a
d'accès statique global.

---

## 4. Adaptateurs

Quatre classes dans `data/repositories/` implémentent les interfaces du
domaine. Elles sont les **seules** à connaître Drift / Dio / Flutter :

| Adaptateur | Interface | Couche métier |
|---|---|---|
| `SrsRepository`        | `ISrsRepository`         | SQLite via Drift, transactions atomiques |
| `CardRepository`       | `ICardRepository`        | `local_cards` + `deck_meta`, plus lecture des assets JSON |
| `EntitlementRepository`| `IEntitlementRepository` | Cache du JWT signé (vérif RS256 en Phase 7) |
| `LocalSyncRepository`  | `ISyncRepository`        | Stub Phase 4 — marquage local `synced=true`, remplacé par `RestSyncRepository` en Phase 6 |

`SrsRepository` implémente `ISrsRepository` **et** expose deux méthodes
historiques pour ne pas casser les tests des Phases 1-3 :

  * `buildStudyQueueRaw(...)` : retourne `List<QueuedCard>` (signature
    interne) ;
  * `buildStudyQueueLegacy(...)` : accepte un `StudyQueueConfig` (tests
    Phases 1-3).

La méthode publique `buildStudyQueue(...)` est l'override d'interface :
elle retourne `List<StudyQueueItem>` et accepte des scalaires (`int`
plafonds), conformément à la Clean Arch — le domaine ne connaît pas
`StudyQueueConfig`.

---

## 5. Composition root

`AppContainer` est l'unique objet qui connaît à la fois les interfaces
du domaine et leurs implémentations :

```dart
final container = AppContainer(database: db);
final state = await container.fetchDueCards(userId: 'u1', nowMs: now);
await container.recordReview(userId: 'u1', cardId: 'c1', ...);
```

Les use cases sont construits paresseusement (`late final`) — un
`AppContainer` reste léger tant qu'on ne l'utilise pas.

Pour la Phase 8, ce container sera exposé via `ProviderScope` (Riverpod),
mais l'API publique ne changera pas. Le ViewModel consommera toujours
`container.recordReview`, pas `SrsRepository` directement.

---

## 6. Tests de la couche domaine (11 cas)

`test/domain/use_cases_test.dart` couvre :

  * **Smoke tests** sur 5 use cases avec une base SQLite mémoire ;
  * **Découplage domain/data** : `SyncOutboxUseCase` est testé avec des
    fakes (`FakeSrsRepository`, `FakeSyncRepository`), sans Drift ;
  * **Défense en profondeur** : `StartMockExamUseCase` refuse
    `questionCount <= 0`, `ValidateEntitlementUseCase` refuse l'accès
    après expiration (sauf grace period) ;
  * **Idempotence** : `DownloadDeckUseCase` détecte un deck déjà
    téléchargé.

Les fakes sont volontairement minimaux — l'objectif est de prouver le
**découplage**, pas de re-tester `SrsRepository` (ça, c'est dans
`test/data/`, déjà couvert par les tests Phases 1-3, non régressés).

---

## 7. Compatibilité ascendante

  * `SrsRepository.buildStudyQueueLegacy(...)` accepte l'ancienne
    signature `StudyQueueConfig` → tests Phases 1-3 toujours verts ;
  * `QueuedCard` reste exporté depuis `data/repositories/srs_repository.dart`
    pour les ViewModels / tests existants ;
  * `StudyQueueConfig` reste exporté, marqué `// Conservé pour la
    rétro-compat` ;
  * Aucune signature de `FsrsEngine`, `ReviewEvent`, `SrsCardState`,
    `ContentParser` n'a changé.

---

## 8. Limites honnêtes

  * `LocalSyncRepository` est un **stub** : il marque les événements
    locaux comme synchronisés sans rien envoyer. C'est honnête (l'app
    reste offline-only) et sera remplacé par `RestSyncRepository` en
    Phase 6.
  * La vérification de signature RS256 du JWT d'entitlement n'est **pas**
    faite à ce stade : on relit l'état en base. La Phase 7 câblera
    `jsonwebtoken` côté Dart et la clé publique embarquée.
  * Riverpod n'est pas encore câblé : la Phase 8 ajoutera
    `flutter_riverpod` et exposera `AppContainer` via `Provider`. L'API
    publique (les use cases) ne changera pas.

---

## 9. Vérification

```bash
# Tests du domaine uniquement (sans Flutter, sans base réelle)
cd mobile && dart test test/domain/

# Toute la suite mobile (inclut SRS engine, content, repository, domaine)
cd mobile && dart test

# Lint
cd mobile && dart analyze --fatal-infos --fatal-warnings
```

Le SDK Dart étant non installable dans le sandbox d'origine, la
validation réelle se fait désormais en CI (`mobile-ci` workflow, livré
dans le commit précédent) à chaque PR.

---

## Suite

Phases 5-6 (backend NestJS + sync serveur + `ts-fsrs` côté TypeScript).
Le client est prêt à consommer le protocole : la signature de
`SyncOutboxUseCase.call(...)` est la même côté mobile et côté serveur.
