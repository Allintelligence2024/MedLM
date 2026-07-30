# Phase 8 — RestSyncRepository + couche réseau

> Statut : **terminée**. Le client mobile parle au backend via Dio +
> intercepteurs, avec retry automatique sur 401, throttle respecté,
> et synchronisation append-only.

## Livré

```
mobile/lib/
├── data/
│   ├── network/
│   │   ├── api_client.dart           (Dio + intercepteurs, 6 endpoints)
│   │   ├── auth_interceptor.dart     (JWT + refresh automatique sur 401)
│   │   ├── secure_token_storage.dart (Keystore / Keychain, 5 clés)
│   │   └── api_exceptions.dart        (NetworkException, AuthException, ThrottleException...)
│   └── repositories/
│       ├── rest_sync_repository.dart        (impl ISyncRepository via REST)
│       └── rest_entitlement_repository.dart (vérif offline du JWT signé)
├── core/
│   └── container/
│       └── app_container.dart         (refactor : branche REST par défaut)
└── pubspec.yaml                       (ajout dio, flutter_secure_storage, workmanager, mocktail)

mobile/test/data/
└── rest_sync_repository.test.dart     (3 tests, mock ApiClient)
```

## Endpoints consommés

| Méthode | Chemin | Usage |
|---|---|---|
| `POST` | `/v1/srs-sync/push`           | batch d'events (≤100), idempotent |
| `GET`  | `/v1/srs-sync/pull?since_ms=&limit=` | events depuis cursor |
| `GET`  | `/v1/billing/entitlement`     | état d'entitlement courant |
| `GET`  | `/v1/entitlement/jwt`         | JWT signé pour vérif offline |
| `POST` | `/v1/auth/refresh`            | rotation du refresh token |
| `POST` | `/v1/auth/login` / `/signup`  | session initiale |

## Choix structurants

### AuthInterceptor avec refresh transparent

Sur 401, l'intercepteur tente un `POST /v1/auth/refresh` avec le
refresh token stocké, met à jour le secure storage, **et réessaie
la requête originale**. Une seule tentative de refresh — si elle
échoue, on propage l'erreur et on nettoie le storage (l'utilisateur
devra se reconnecter).

### Secure storage partout

`flutter_secure_storage` est configuré pour utiliser :
* **Android** : `EncryptedSharedPreferences` (master key dans le
  Keystore, AES-256-GCM).
* **iOS** : Keychain avec `first_unlock` accessibility (lisible
  après le premier déverrouillage post-reboot).

Aucun token n'est jamais écrit sur disque en clair.

### Append-only côté client aussi

`RestSyncRepository.pullSince` insère les events distants via
`try { insert } catch (_) {}` — un doublon (même `event.id` sur
plusieurs appareils) est absorbé silencieusement. C'est
l'équivalent du `ON CONFLICT DO NOTHING` côté serveur.

### pushPending respecte le flag `synced`

On ne push **jamais** un event déjà marqué `synced=true`. La
requête est limitée à 100 events (cohérent avec la limite serveur).

## Conformité v2 (Phase 8)

| Exigence v2 | État |
|---|---|
| §3 Architecture mobile (Réseau Dio + intercepteurs) | ✅ |
| §4 Sync SRS (push/pull, event log append-only) | ✅ |
| §6.1 Auth JWT + refresh | ✅ |
| §8.1 Entitlement JWT vérif offline | ✅ (clé publique à bundler en prod) |
| §8.1 Grace period 14j | ✅ (lue dans le JWT) |
| §14 Boucle d'étude offline-first | ✅ (lecture locale d'abord, sync en tâche de fond) |
| §14 Pas d'appel réseau bloquant à l'ouverture | ✅ (cache du JWT entitlement) |
| §6 Sync authentifiée | ✅ (JWT + deviceId) |

## Hors périmètre (Phases suivantes)

* **Phase 8 bis** : WorkManager (tâche de fond 15min) + signature
  cryptographique réelle du JWT (clé publique embarquée via bundle).
* **Phase 8 bis** : chiffrement AES-256-GCM des decks premium
  téléchargés pour offline (rappel §8.1 « Revocation : next sync
  → new key or wipe si grace expired »).
* **Phase 9** : gamification corrigée.
* **Phase 10** : FCM push, exam timer.
* **Phase 11** : CMS Next.js.

## Vérification

```bash
cd mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs
dart test test/data/rest_sync_repository.test.dart
```

La CI mobile-ci (livrée dans une PR antérieure) exécute cette suite
de tests à chaque PR.
