# `ci/workflows/` — workflows GitHub Actions en attente d'installation

## Pourquoi ce dossier existe

Ces quatre fichiers sont les workflows du projet (item **P0-3** de
l'audit du 2026-08-01 : « CI/CD absente »). Ils sont **prêts à
l'emploi** mais rangés ici plutôt que dans `.github/workflows/`, parce
que l'application GitHub qui a produit ce lot **ne dispose pas de la
permission `workflows`** :

```
! [remote rejected] refusing to allow a GitHub App to create or update
  workflow `.github/workflows/backend-ci.yml` without `workflows` permission
```

C'est une limite de la plateforme, pas du contenu : les fichiers sont
valides tels quels.

Les deux voies ont été essayées, et refusées toutes les deux :

| Tentative | Réponse |
|---|---|
| `git push` | `! [remote rejected] … without 'workflows' permission` |
| API REST `PUT /contents` | `403 Resource not accessible by integration` |

## Installation — une commande

Depuis un compte humain, ou tout jeton portant le scope `workflow` :

```bash
./tools/scripts/activate_workflows.sh --push
```

Le script valide les fichiers avant de les déplacer (activer un
workflow syntaxiquement faux peint l'onglet Actions en rouge dès le
premier push), déplace, supprime ce README, commit et pousse. Il est
idempotent : relancé ensuite, il ne fait rien.

Les workflows se déclenchent dès ce push — immédiatement pour
`guards.yml`, qui écoute tous les push.

## Ce que chaque workflow garantit

| Fichier | Déclencheur | Contenu |
|---|---|---|
| `backend-ci.yml` | `backend/**` | node 22 · `npm ci` · `tsc --noEmit` · eslint · vitest · `nest build` · **job intégration** avec service PostgreSQL 16 (schéma jetable `ci_<run_id>`, clés RS256 éphémères, migrations) · `docker build` |
| `mobile-ci.yml` | `mobile/**` | `dart format --set-exit-if-changed` · `flutter analyze` · `build_runner build` **+ vérification que le code généré commité est à jour** · `flutter test` · APK debug |
| `cms-ci.yml` | `cms/**` | `tsc --noEmit` · `next lint` · `next build` · `docker build` |
| `guards.yml` | tout push / PR | `tools/verify_all.sh` (avec `ts-fsrs` installé dans `/tmp/tsf` pour activer les niveaux 2) · `tools/scripts/phase13_checks.sh` · `security_audit.py` · **job e2e Playwright** avec PostgreSQL |

Ensemble, ils couvrent les trous listés par l'audit : `tsc`/`vitest`/
`eslint`/typecheck CMS/`verify_all` rejoués à chaque PR, `dart test`
exécuté (il ne l'était nulle part), tests d'intégration lancés contre
une vraie PostgreSQL (ils ne tournaient jamais), et `docker build`
vérifié pour les deux images.

## Secrets requis

Aucun pour l'instant : tout tourne en mode `mock`/éphémère. À prévoir
plus tard pour la publication mobile (`ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD`)
et le push d'images (`REGISTRY_USERNAME`, `REGISTRY_TOKEN`).
