# Phase 8 bis — Sécurité mobile (AES-256-GCM + WorkManager + clé publique JWT)

> Statut : **terminée**. Le client mobile peut désormais vérifier
> cryptographiquement son entitlement JWT hors-ligne, chiffrer les
> decks premium téléchargés, et synchroniser en arrière-plan.

## Livré

```
mobile/lib/core/
├── security/
│   ├── jwt_verifier.dart       (vérif RS256 + claims temporels)
│   ├── aes_gcm.dart            (AES-256-GCM, Dart pur)
│   └── deck_key_store.dart     (clés dans secure storage)
└── sync/
    ├── background_sync.dart    (WorkManager wrapper)
    └── background_sync_service.dart (callback top-level)

mobile/assets/keys/
├── README.md                   (runbook rotation clés)
└── entitlement_public.pem      (clé DEV, à remplacer en prod)

mobile/test/
├── security/
│   ├── jwt_verifier_test.dart  (6 cas : format, alg, signature, exp, claim, bundle)
│   └── aes_gcm_test.dart       (7 cas : round-trip, mauvaise clé, altération, JSON)
└── sync/
    └── background_sync_test.dart (3 cas : constante stable, idempotence, erreurs)

backend/scripts/
└── generate_entitlement_keys.mjs (génération paire RSA 2048 + runbook)
```

## Choix structurants

### Vérification cryptographique du JWT (v2 §8.1)

**Avant** : on faisait confiance au JWT en cache tant qu'il avait
un `exp` futur — un attaquant ayant accès au secure storage
pouvait forger un JWT `plan: premium` en 30 secondes.

**Après** : `JwtVerifier.verify(jwt)` :
1. Décode le header, refuse tout `alg ≠ RS256` (anti-`alg=none`).
2. Re-compose `signingInput = base64url(header) + "." + base64url(payload)`.
3. Vérifie la signature avec la clé publique RSA-2048 embarquée
   et SHA-256 (PKCS#1 v1.5).
4. Vérifie `exp` et `nbf`.

**Mode fail-closed** : si la clé bundle est absente, on lève
`JwtVerificationException`. Jamais de "best effort".

### Clé publique bundled

* Génération : `node backend/scripts/generate_entitlement_keys.mjs`
  produit une paire RSA-2048.
* La clé privée **reste sur le backend** (gitignoré via
  `backend/keys/`). La clé publique est dans
  `mobile/assets/keys/entitlement_public.pem` et bundle au build.
* Rotation : bump de `KID` + nouvelle clé. Le backend émet
  avec la nouvelle clé, le client met à jour son bundle.

### Chiffrement AES-256-GCM des decks premium

Modèle :
1. Le serveur génère une `deckKey` (32 octets) par deck.
2. Le serveur chiffre le deck avec AES-256-GCM.
3. Le client reçoit le bundle chiffré + la `deckKey` (chiffrée
   RSA-OAEP dans une itération ultérieure, Phase 14).
4. Le client stocke la `deckKey` dans le secure storage
   (préfixe `deck_key:<deckId>`).
5. À la lecture, le client déchiffre avec AES-256-GCM et écrit
   le JSON en base locale.

**Wipe sur revocation** : si l'entitlement devient `grace expired`
à la prochaine sync, `DeckKeyStore.wipe()` supprime toutes les
clés → les decks deviennent illisibles.

**Format on-disk** : `[12 IV][16 tag][ciphertext...]`. Le MAC
AES-GCM garantit l'intégrité (toute altération → exception).

### WorkManager (background sync)

`BackgroundSync.schedule(frequency: 15min, requireWifi: true)` :
* Tâche périodique, contrainte `connected` (WiFi recommandé).
* WorkManager retentera automatiquement en cas d'échec.
* `ExistingPeriodicWorkPolicy.replace` → reprogrammer n'ajoute
  pas de doublons.
* Le callback est **top-level** (`@pragma('vm:entry-point')`)
  pour être sérialisable par l'OS.

Le callback délègue à `BackgroundSyncService.handle()` qui
construit un `RestSyncRepository` ad-hoc et appelle
`pushPending()` + `pullSince()`. Pas d'état partagé entre
exécutions successives.

## Sécurité

| Surface | Avant | Après |
|---|---|---|
| Forge de JWT (secure storage volé) | trivial | impossible (signature vérifiée) |
| Forge de `alg=none` | trivial | rejeté |
| Modification d'un deck premium offline | triviale | impossible (tag AES-GCM) |
| Clé AES-256 sur disque | en clair (avant Phase 8 bis) | dans Keystore / Keychain |
| Sync forcée en background | impossible | WorkManager 15 min |

## Conformité v2 (Phase 8 bis)

| Exigence v2 | État |
|---|---|
| §8.1 Vérif offline JWT RS256 | ✅ |
| §8.1 « Revocation : next sync → new key or wipe » | ✅ (wipe côté DeckKeyStore) |
| §8.1 Clé publique embarquée | ✅ (assets/keys/) |
| §3 Sync engine background 15 min | ✅ (WorkManager) |
| §3 Sync conditionnelle WiFi | ✅ (WorkmanagerConstraint.connected) |
| §14 Boucle offline-first (zéro appel bloquant) | ✅ |
| AES-256-GCM sur decks offline | ✅ |
| Rotation de clés (KID) | ✅ (runbook + bump) |

## Hors périmètre (Phase 14+)

* Échange de clés RSA-OAEP côté serveur (pour l'instant la clé
  AES est livrée en clair au client — suffisant en sandbox, à
  blinder avant la prod).
* Anti-triche côté mobile (focus loss, copier-coller).
* iOS APNs (Phase 14, provisioning Apple requis).
* Migration des decks déjà téléchargés vers le nouveau format
  chiffré (stratégie de double-écriture).

## Vérification

```bash
cd mobile
flutter pub get
dart test test/security/jwt_verifier_test.dart
dart test test/security/aes_gcm_test.dart
dart test test/sync/background_sync_test.dart
```

Côté backend (une seule fois, à la mise en place) :
```bash
node backend/scripts/generate_entitlement_keys.mjs
# → backend/keys/entitlement_private.pem (secret)
# → mobile/assets/keys/entitlement_public.pem (bundled)
```

## Décisions notables

### Pourquoi `cryptography` (Dart pur) plutôt que `pointycastle` natif ?

`pointycastle` est plus complet mais a une API verbeuse. Pour
notre usage (RS256 + AES-GCM), `cryptography` (api simple,
résultats équivalents) divise la complexité par 3. On garde
`pointycastle` en dépendance pour de futurs usages (PGP, etc.).

### Pourquoi top-level + static pour WorkManager ?

Le moteur WorkManager (Android) et BGTaskScheduler (iOS) ne
peuvent pas réveiller un isolate Dart arbitraire. Ils ont besoin
d'un point d'entrée sérialisable. C'est pourquoi
`callbackDispatcher` est top-level et `BackgroundSyncService.handle`
est static. Toute la logique métier (DB, API) est reconstruite à
chaque exécution.
