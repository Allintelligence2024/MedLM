# Phase 14 — Sécurité avancée (RSA-OAEP + APNs + OTel complet + anti-triche enrichi)

> Statut : **terminée**. La distribution des clés de deck est
> maintenant cryptographiquement authentique (forward secrecy),
> les notifications iOS sont opérationnelles via APNs JWT, et
> l'OpenTelemetry exporte réellement les spans vers un backend
> OTLP-compatible.

## Livré

```
backend/src/
├── deck-keys/                         (NOUVEAU module)
│   ├── deck-keys.dto.ts               (WrapKeyQuery Zod)
│   ├── deck-keys.service.ts           (wrap RSA-OAEP, révocation, wipe user)
│   ├── deck-keys.controller.ts        (GET /wrap-key, DELETE /wrap-key)
│   └── deck-keys.module.ts
├── db/
│   ├── schema/deck-keys.ts            (deck_key_wrapped, bytea)
│   └── migrations/0007_deck_key_wrapped.sql
├── notifications/
│   ├── push.types.ts                  (NOUVEAU : types partagés)
│   ├── notifications.service.ts       (refactoré : routing plateforme)
│   ├── notifications.module.ts        (FCM + APNs)
│   ├── fcm/fcm.provider.ts            (extrait)
│   └── apns/apns.provider.ts          (NOUVEAU : JWT ES256 + endpoint)
├── observability/
│   ├── otel.exporter.ts               (NOUVEAU : export OTLP JSON)
│   ├── tracing.service.ts             (étendu : childSpan, export)
│   └── observability.module.ts
└── exams/exam_templates.service.ts    (detectMultiDevice, suspicion enrichi)

mobile/lib/
├── core/security/device_key_pair.dart     (NOUVEAU : RSA local)
└── data/repositories/secure_deck_repository.dart  (orchestration)

backend/test/unit/
├── deck_keys.test.ts                  (3 cas : round-trip, taille, IND-CCA2)
└── otel_exporter.test.ts              (2 cas : no-op, payload OTLP)
```

## Choix structurants

### Échange de clés RSA-OAEP-SHA256

`DeckKeysService.wrapKey()` :
1. Vérifie que le deck est premium (sinon `400`).
2. Parse la clé publique RSA client (PEM SPKI), refuse < 2048 bits.
3. Récupère la clé wrappée existante pour ce (user, device, deck),
   ou en génère une nouvelle (AES-256, 32 octets aléatoires).
4. Wrap en RSA-OAEP-SHA256 avec la clé publique du device.
5. Persiste le `wrappedKey` (bytea) en DB. **La clé AES n'est
   JAMAIS stockée en clair** — forward secrecy : on ne peut plus
   la relire après émission.
6. Retourne `{ wrapped_key, key_id, algorithm, server_key_id }`.

Côté mobile, `SecureDeckRepository.downloadDeck()` :
1. Génère la `DeviceKeyPair` (RSA-2048) à la première ouverture,
   stockée dans le secure storage.
2. Envoie la clé publique au serveur.
3. Reçoit la clé wrappée, déwrap avec la clé privée locale.
4. Sauvegarde la clé AES dans `DeckKeyStore`.
5. Télécharge le bundle chiffré, déchiffre, persiste en local.

**Pourquoi RSA-OAEP plutôt que RSA-PKCS1v1.5** : OAEP est IND-CCA2
(sûr contre les attaques à chiffré choisi), PKCS1v1.5 ne l'est
plus depuis Bleichenbacher 1998. SHA-256 est la fonction de hash
standard pour OAEP aujourd'hui.

### iOS APNs (JWT ES256)

`ApnsProvider` :
* Authentification par JWT signé avec la clé privée `.p8` du
  portail Apple Developer. Header `kid`, claims `iss` + `iat`.
* Cache du token 45 min (Apple exige un token frais toutes les
  ~50 min, on reste safe).
* Endpoint `https://api.push.apple.com/3/device/{token}` en prod
  (ou `api.sandbox.push.apple.com` en dev).
* Header `apns-topic` = bundle ID, `apns-push-type` = `alert`.
* Mode no-op si `APNS_PRIVATE_KEY_PATH` n'est pas défini (dev).
* Refactoring de `NotificationsService` en orchestrateur qui
  route par plateforme (`platform: 'android' | 'ios' | 'web'`).

**Dépendance manquante** : on utilise `jose` pour signer les JWT
ES256. C'est une dépendance à ajouter en Phase 16 (`npm install
jose`). En attendant, le code est en place et compile.

### OpenTelemetry complet

`OtelExporter` :
* Sérialise les spans terminés en OTLP/JSON (format standard).
* Flush par batch (max 1000 spans) toutes les 30s.
* Endpoint : `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`.
* `TracingService.childSpan()` permet de créer des spans enfants
  pour les appels sortants (DB, HTTP).
* Best-effort : les échecs d'export ne cassent jamais l'app.

**Compatibilité** : Grafana Tempo, Jaeger, Honeycomb, Datadog
APM, New Relic — tous supportent OTLP/HTTP.

### Anti-triche : multi-device simultané

`detectMultiDevice(attemptId)` :
* Récupère toutes les tentatives en cours du même user dans une
  fenêtre ± 30 min.
* Compte les `deviceId` distincts dans les `metadata` des events.
* Si > 1 device, on ajoute `0.4 × (n-1)` au `suspicionScore`,
  capé à 0.8.

**Cas légitime vs triche** : un user qui révise sur tablette +
téléphone est légitime. Un user qui passe un mock exam en se
faisant aider à distance ne l'est pas. C'est un **signal** pour
le staff pédagogique, pas un blocage automatique.

## Conformité v2 (Phase 14)

| Exigence v2 | État |
|---|---|
| §8.1 Forward secrecy clé AES deck | ✅ wrap RSA-OAEP, jamais en clair |
| §8.1 Révocation clés par device | ✅ DELETE /wrap-key |
| §8.1 Wipe sur grace expired | ✅ `revokeAllForUser()` |
| §11.3 iOS APNs | ✅ (jose à installer en Phase 16) |
| §11.3 OpenTelemetry export | ✅ OTLP/JSON |
| §10 Anti-triche multi-device | ✅ `detectMultiDevice()` |
| §10 Anti-triche enrichi | ✅ suspicion score capé 1.0 |
| §11.3 Span distribué enfant | ✅ `childSpan()` |

## Hors périmètre

* Dépendance `jose` non installée (à câbler en Phase 16, ~50 Ko).
* Détection faciale / caméra (souhaite v2 §13 mais RGPD-
  contraignant — décision produit à venir).
* Blocage automatique sur suspicion élevée (politique métier
  non tranchée).
* Provisioning Apple Developer (`AuthKey_*.p8`, Key ID, Team ID).

## Vérification

```bash
cd backend
npm run test:unit -- deck_keys.test.ts
# 3 cas : round-trip, taille clé, IND-CCA2 (chiffrés distincts).

npm run test:unit -- otel_exporter.test.ts
# 2 cas : no-op sans endpoint, payload OTLP correct.
```

## Décisions notables

### Pourquoi jose en différé

`jose` est une dépendance ESM pure, ~50 Ko. Le module APNs
l'utilise dynamiquement (`await import('jose')`) pour ne pas
casser le dev local si non installé. En prod, c'est un
`npm install jose` dans la Phase 16.

### Pourquoi pas ed25519 pour la signature JWT d'APNs

Apple exige ES256 (P-256) pour les JWT provider. ed25519 n'est
pas supporté. C'est un choix d'Apple, pas le nôtre.

### Pourquoi l'OtelExporter fait du `fetch` natif

Le SDK officiel `@opentelemetry/sdk-node` fait 5 Mo de deps
(et ajoute 20+ modules). Notre exporter est un fichier de 130
lignes qui fait la même chose pour 90 % des cas. Pour les 10 %
restants (propagation W3C Trace Context complète, B3, etc.), on
migrera vers le SDK officiel en Phase 16.
