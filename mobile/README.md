# MedAnki DZ — application mobile (Flutter)

> Dart ≥ 3.4 · Flutter stable · Drift/SQLite · Riverpod · go_router

## Démarrer

Le dépôt ne versionne **pas** les dossiers `android/` et `ios/` : ce
sont des artefacts régénérables, qui polluent chaque diff et entrent en
conflit à chaque montée de version de Flutter. Première étape, une
seule fois après le clone :

```bash
cd mobile
flutter create --platforms=android,ios --org dz.medanki --project-name medanki_dz .
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

`10.0.2.2` est l'alias de `localhost` vu depuis l'émulateur Android.
Sur un appareil physique, indiquer l'IP de la machine hôte.

## Configuration

Toute la configuration passe par `--dart-define` — jamais par un
fichier embarqué (un `.env` dans les assets est lisible en décompilant
l'APK).

| Variable | Défaut | Rôle |
|---|---|---|
| `API_BASE_URL` | `http://10.0.2.2:3000` | Racine de l'API |
| `FLAVOR` | `dev` | `dev` \| `staging` \| `prod` |

Un build `prod` qui pointerait sur une URL locale ou non-HTTPS échoue
sur une assertion au démarrage (`AppConfig.isConsistent`).

## Architecture

```
lib/
├── main.dart              point d'entrée : DB, version, sync, runApp
├── app/                   racine widget, thème, routeur go_router
├── core/                  logique pure, sans Flutter quand c'est possible
│   ├── srs/               moteur FSRS-5 (parité stricte avec ts-fsrs)
│   ├── di/                composition root Riverpod
│   ├── session/           état d'authentification
│   ├── settings/          préférences (langue, objectif, rappels)
│   ├── notifications/     FCM : jeton, permission, deep links
│   ├── security/          AES-GCM, clés de deck, vérif JWT hors ligne
│   └── sync/              worker de fond (WorkManager)
├── data/                  Drift (local) + Dio (réseau) + repositories
├── domain/                entités et use cases — zéro dépendance externe
├── l10n/                  .arb FR/AR/EN + AppLocalizations généré
└── ui/                    écrans
```

Règle structurante : `domain/` ne connaît ni Flutter, ni Drift, ni Dio.
C'est ce qui permet de tester le moteur de révision sans émulateur.

## Code généré

Deux fichiers sont **générés et commités** :

| Fichier | Producteur | Régénérer |
|---|---|---|
| `lib/data/local/app_database.g.dart` | drift_dev | `dart run build_runner build --delete-conflicting-outputs` |
| `lib/l10n/app_localizations.dart` | `tools/scripts/gen_l10n.py` | `python3 tools/scripts/gen_l10n.py` |

Ils sont commités pour que le dépôt reste compilable sans étape
préalable ; la CI vérifie qu'ils sont à jour et échoue sinon.

## Internationalisation

Trois langues : **français** (langue de rédaction), **arabe**,
**anglais**. Les chaînes vivent dans `lib/l10n/app_*.arb`.

```dart
final l10n = AppLocalizations.of(context);
Text(l10n.homeStartStudy)
```

`tools/scripts/check_mobile_i18n.py` échoue si une clé manque dans une
langue, si un placeholder diverge, ou si une chaîne française est
écrite en dur dans un widget. Les sept écrans antérieurs à l'i18n sont
sur une liste d'exception explicite **qui ne peut que rétrécir**.

## Tests

```bash
flutter analyze
flutter test
dart format --output=none --set-exit-if-changed lib test
```

Gardes exécutables sans SDK Flutter (utiles en sandbox) :

```bash
python3 tools/scripts/check_dart_static.py      # classes imbriquées, imports cassés
python3 tools/scripts/check_mobile_i18n.py      # parité FR/AR/EN
python3 tools/scripts/check_faculties_parity.py # allow-list serveur ↔ client
python3 tools/dart_parity_check.py              # moteur FSRS ↔ référence
```

## Publication

Voir `store/RELEASE_CHECKLIST.md`. Points ouverts avant la première
release : clés de signature en secrets CI, `shrinkResources`, et le
remplacement des visuels de `assets/branding/` par les vrais.
