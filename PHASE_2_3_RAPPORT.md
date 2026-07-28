# ✅ Phases 2 & 3 — Persistance robuste et contenu externalisé

> Statut : **terminées**. Vérification : `./tools/verify_all.sh` (7 étapes, toutes vertes).

---

## Phase 2 — Persistance robuste

### Livré

```
mobile/lib/data/
├── local/
│   ├── schema/v1.sql          schéma de référence, exécuté et testé
│   ├── schema/v2.sql          migration additive (signalements, freeze)
│   ├── tables.dart            11 tables Drift
│   └── app_database.dart      migrations réelles + déclencheurs append-only
└── repositories/
    └── srs_repository.dart    file d'étude, enregistrement atomique, rejeu
```

### Les trois problèmes du prototype, corrigés

| Problème | Correction |
|---|---|
| `fallbackToDestructiveMigration()` → **toute la progression effacée** à chaque changement de schéma | Migrations explicites et additives. La migration v1→v2 est exécutée sur un jeu de données réel et l'égalité stricte des compteurs avant/après est vérifiée. |
| `review_logs` inséré en `REPLACE` → une revue pouvait être écrasée | **Deux déclencheurs SQL** rejettent `UPDATE` et `DELETE`. La protection est dans la base, pas seulement dans le code : même un bug applicatif ne peut plus détruire d'historique. Seul `synced` reste modifiable. |
| `UserStats(id = 1)` → mono-utilisateur, mono-appareil | `user_id` sur toutes les tables, clé primaire `(user_id, card_id)`. Deux comptes cohabitent sur un même appareil sans se voir. |

### Le schéma (11 tables, 97 colonnes)

Contenu (`deck_meta`, `local_cards`), SRS (`review_log` append-only, `srs_state`),
synchronisation (`outbox_events`, `sync_cursor`), compte (`entitlement`,
`study_sessions`, `daily_counters`, `user_prefs`), signalements (`card_reports`).

Points notables :
- `outbox_events` porte `retry_count` et `next_attempt_at` — le backoff
  exponentiel est prévu dès le schéma, pas ajouté après coup ;
- `srs_state.buried_until_ms` permet le *bury siblings* de la v2 ;
- `deck_meta.can_distribute` est le levier de **takedown à distance** ;
- `daily_counters.day_key` est en heure **locale** : la journée d'étude d'un
  étudiant est celle de son fuseau, pas celle du serveur.

### La garantie centrale

`recordReview()` écrit **dans une seule transaction** : le journal, la file de
sortie et la projection d'état. Si l'application est tuée au milieu, rien n'est
écrit à moitié. Et comme `fold` est déterministe, l'état est de toute façon
reconstructible : `rebuildFromLog()` rejoue le journal et **retrouve exactement
l'état stocké** — vérifié sur une séquence de 6 revues incluant un oubli.

---

## Phase 3 — Contenu externalisé et sécurisé juridiquement

### Livré

```
mobile/lib/core/content/
├── source_meta.dart      provenance obligatoire, takedown
├── card_content.dart     contenu bilingue FR-first, QCM, médias
└── content_parser.dart   checklist qualité v2 rendue exécutable

mobile/assets/content/
├── deck_anatomie_membre_superieur.json   4 cartes (démo gratuit)
└── deck_biochimie_glycolyse.json         3 cartes (premium)
```

### Le contenu devient un actif, plus du code

Les 7 cartes étaient écrites en dur dans un `object` Kotlin, sans version, sans
statut, sans source. Elles sont maintenant des **fichiers JSON versionnés**,
dans la structure exacte du JSONB serveur — une carte transite du CMS au mobile
sans transformation.

### La Content Policy est exécutable, pas documentaire

C'est le point le plus important de cette phase. Le document v2 décrivait une
checklist ; elle est désormais **appliquée par le parser au chargement** :

| Règle | Comportement |
|---|---|
| `source_type` absent ou inconnu | carte **refusée** |
| `partnership` sans attribution | carte **refusée** |
| `inspired` sans note de reformulation | carte **refusée** — sans documentation, rien ne distingue l'inspiration de la copie d'annale |
| `can_distribute_offline: false` | carte **jamais chargée** (takedown effectif même sur contenu déjà embarqué) |
| Carte sans explication clinique | carte **refusée** |
| QCM sans bonne réponse / unique à 2 bonnes réponses / multiple à 1 seule | carte **refusée** |
| Distracteur sans explication | carte **refusée** — c'est la valeur pédagogique |
| Identifiants d'options dupliqués | carte **refusée** (réponse ambiguë) |
| Image sans `alt_fr` | carte **refusée** |
| Français manquant | carte **refusée** |

**15 cas invalides sont testés** pour vérifier que ces règles rejettent
réellement. Un validateur qui n'échoue jamais ne protège de rien.

En mode non strict, une carte défectueuse est **isolée** plutôt que de faire
échouer tout le deck : l'étudiant peut réviser, et le rejet est collecté pour
être remonté (il signale un bug du CMS, pas une erreur de l'utilisateur).

### FR-first, comme le prévoit la v2

Le prototype était anglais-d'abord (`langPref = "EN"`). C'est inversé : le
français est obligatoire, l'anglais est un complément (terme médical
international, explication optionnelle), avec repli automatique.

---

## Vérification — 75 contrôles exécutés

Le SDK Dart n'étant pas installable ici, j'ai validé la **logique** là où elle
est réellement risquée, en exécutant du vrai SQLite et du vrai contenu :

```
30  schéma, migrations, append-only, contraintes, plans d'index
20  logique du dépôt (atomicité, examen, compteurs, rejeu, isolation)
11  tables / 97 colonnes — parité SQL ↔ Drift
24  Content Policy (2 decks, 7 cartes, 15 cas invalides)
```

Détails notables :
- les **plans d'exécution SQLite** sont inspectés : `idx_srs_due`,
  `idx_review_log_card`, `idx_review_log_unsynced` et `idx_outbox_ready` sont
  effectivement utilisés, pas seulement créés ;
- la migration v1→v2 est exécutée sur des données réelles et l'égalité stricte
  avant/après est vérifiée ;
- les tentatives d'`UPDATE`/`DELETE` sur le journal sont testées et doivent
  échouer.

> ⚠️ **Limite inchangée** : les tests Dart (`golden_test`, `fold_properties_test`,
> `content_parser_test`, `srs_repository_test` — plus de 1 200 lignes) sont
> écrits mais **non exécutés** dans ce sandbox. À lancer via
> `cd mobile && dart test`, automatisé en Phase 12. Le code généré par Drift
> (`app_database.g.dart`) doit être produit par `build_runner` au premier build.

---

## Écarts assumés

| Point | Décision |
|---|---|
| Schéma SQL de référence en plus des classes Drift | Permet de tester réellement migrations, déclencheurs et index sans SDK Dart. Un garde-fou (`check_schema_parity.py`) empêche les deux de diverger. |
| Contenu de départ : 7 cartes | Volume identique au prototype, mais désormais conforme et versionné. Le remplissage (600 cartes Anatomie…) est un travail éditorial, pas technique. |
| `user_prefs` en base plutôt que Hive | Une seule source de persistance à sauvegarder et à effacer à la suppression du compte. |

## Suite

Phases 5→7 (backend NestJS, Postgres, sync, entitlement) puis Phase 8
(intégration). Le protocole est déjà figé côté client : `ReviewEvent.toJson()`
correspond au corps attendu par `POST /sync/push`.
