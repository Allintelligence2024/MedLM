# VERIFY.md — matrice de validation MedAnki DZ

> Document de référence : **quel script prouve quoi**, dans quel ordre,
> et ce qui nécessite un environnement hors-sandbox. Mis à jour à
> chaque ajout de garde-fou.

## Niveau 0 — à chaque push (sandbox-compatible, < 10 s)

| Script | Prouve |
|---|---|
| `tools/scripts/security_audit.py` | 0 secret en dur, 0 print non justifié (sentinelles de linter honorées), 0 `@Body` sans Zod, 0 contrôleur sans garde |
| `tools/scripts/generate_lockfiles.py --check` | cohérence lockfiles backend/cms/mobile/tools |
| `tools/validate_content.py` | Content Policy : 697 cartes, règles de rejet, sources obligatoires |
| `tools/scripts/check_syntax_guard.py` | délimiters `(){}[]` équilibrés (Dart mobile/ + Python tools/tests), 0 marqueur de conflit repo-wide ; TS exclu documenté (regex/gabarits imbriqués) |
| `tools/scripts/check_dart_static.py` | Dart statiquement valide sans SDK : 0 classe imbriquée, 0 extension instanciée, `part`/imports résolus (a révélé 3 fichiers qui n'avaient jamais compilé — audit P0-2) |
| `tools/scripts/check_mobile_i18n.py` | i18n mobile : 177 clés × FR/AR/EN, placeholders alignés, **0 chaîne FR en dur dans `lib/ui/`, liste d'exception vide** (audit P1-4) |
| `tools/scripts/check_faculties_parity.py` | l'allow-list serveur des facultés == le choix proposé à l'inscription (contenu, ordre, années, niveaux) |
| `tools/scripts/gen_l10n.py --check` | `app_localizations.dart` généré est à jour vis-à-vis des `.arb` |
| `tools/scripts/check_bundle_assets.py` | aucun deck de démonstration livré en production, archive hors bundle (audit P2-4) |
| `tools/scripts/apply_android_release_config.py --check` | build de release Android : R8 et shrink actifs, signature de release (jamais la clé de debug), `applicationId` de production (audit P2-8) |
| `tools/scripts/check_l10n_usage.py` | chaque `l10n.clé(…)` du code existe, avec la bonne arité (getter vs méthode, nombre d'arguments) — remplace le compilateur Dart sur ce point |
| `tools/scripts/check_dart_symbols.py` | méthodes et paramètres nommés de `ApiClient`, membres d'`AppContainer`, providers Riverpod, imports des tests |
| `tools/scripts/check_workflows.py` | workflows CI : YAML valide, `needs` déclarés, scripts et `working-directory` existants, `npm run` déclarés, 0 secret en dur |
| `tools/scripts/check_dockerfiles.py` | images : étapes `COPY --from` existantes, sources présentes dans le contexte, **healthcheck ↔ route backend réelle**, user non-root, base taguée ; compose : dockerfiles, dépendances, volumes nommés, `service_healthy` ↔ healthcheck déclaré |
| `tools/scripts/phase13_checks.sh` | orchestre tout ce niveau + load-tester self-test |

## Niveau 1 — moteur SRS (python, < 2 s)

| Script | Prouve |
|---|---|
| `tools/dart_parity_check.py` | poids Dart = référence, formules critiques, pureté, seuils adaptatifs TS↔Dart↔Python |
| `tools/generate_golden.py` | régénère `golden_scenarios.json` (33 scénarios + 8 cas adaptatifs) — le diff doit être justifié |
| `tools/test_migrations.py` | 30 vérifs schéma SQLite (append-only, triggers, index) |
| `tools/test_repository_logic.py` | 20 vérifs logique dépôt SRS (fold, outbox, isolation) |
| `tools/check_schema_parity.py` | tables Drift ↔ schéma SQL de référence |

## Niveau 2 — référence externe (nécessite ts-fsrs en /tmp/tsf)

| Script | Prouve |
|---|---|
| `tools/verify_against_ts_fsrs.js` + `tools/cross_check.py` | 855 primitives == ts-fsrs officiel (dont section adaptative w11×1.15 / w8×1.05) |
| `tools/verify_sequences_ts.js` + `tools/cross_check_sequences.py` | séquences complètes == ts-fsrs |

## Niveau 3 — livrables lancement

| Script | Prouve |
|---|---|
| `tools/scripts/check_landing.py` | landing : 61 clés × 3 langues, FR inliné, 0 tracker |
| `tools/scripts/check_store.py` | 6 fiches stores ≤ 80 c, 0 promesse médicale, labels ↔ PRIVACY.md |
| `tools/scripts/pentest_prep.py` | périmètre pen test : rotation tokens, wrap-key, quotas IA, append-only, anti-injection, rôle admin |

## Niveau 3b — livrables scale (Phase 20)

| Script | Prouve |
|---|---|
| `tools/scripts/check_regions.py` | 3 régions DZ (alger primary, oran/constantine répliques), `timezone: 'Africa/Algiers'` partout, overlays K8s cohérents |
| `tools/scripts/check_graphql.py` | gateway GraphQL : opérations persistées ↔ délégations réelles dans les contrôleurs REST, budget coût, GraphQL désactivable |
| `tools/ml_eval.py` | prédicteur d'examen blanc : 100 % parité coefficients TS↔Python, MAE ≤ 10, séparation low→high ≥ 8 pts |
| `tools/scripts/check_partnerships.py` | facultés citées dans le contenu ∈ allow-list des 10 facultés, machine d'état des partenariats |

## Niveau 4 — hors sandbox (environnements dédiés)

| Où | Quoi |
|---|---|
| CI avec SDK Dart | `cd mobile && dart test` (golden, adaptatifs, widgets IA, sécurité) |
| CI avec node_modules | `cd backend && npm run test` (vitest, 501 cas) |
| CI avec PostgreSQL | `cd backend && npm run test:integration` (5 fichiers, 28 cas : routage, sync, refresh, webhook billing, chronométrage examen) — `backend-ci.yml` |
| CI avec Docker | `docker build` des images backend et CMS |
| Staging K8s | `helm`/`kustomize` overlays prod, SLO Phase 17 (P95 < 500 ms, 5xx < 1 %) |
| Prestatire externe | pen test — canal SECURITY.md §1, périmètre = `pentest_prep.py --report` |
| Device physique | plugins STT/TTS, notifications FCM/APNs, transaction Chargily |

## Orchestrateurs

- `bash tools/scripts/phase13_checks.sh` — niveau 0 complet (bloquant avant push)
- `bash tools/verify_all.sh` — niveaux 0→3 + tests Dart si SDK présent
