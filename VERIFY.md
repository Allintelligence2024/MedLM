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

## Niveau 4 — hors sandbox (environnements dédiés)

| Où | Quoi |
|---|---|
| CI avec SDK Dart | `cd mobile && dart test` (golden, adaptatifs, widgets IA, sécurité) |
| CI avec node_modules | `cd backend && npm run test` (vitest, ~130 cas IA + modules) |
| Staging K8s | `helm`/`kustomize` overlays prod, SLO Phase 17 (P95 < 500 ms, 5xx < 1 %) |
| Prestatire externe | pen test — canal SECURITY.md §1, périmètre = `pentest_prep.py --report` |
| Device physique | plugins STT/TTS, notifications FCM/APNs, transaction Chargily |

## Orchestrateurs

- `bash tools/scripts/phase13_checks.sh` — niveau 0 complet (bloquant avant push)
- `bash tools/verify_all.sh` — niveaux 0→3 + tests Dart si SDK présent
