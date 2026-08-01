# ✅ Phase 6 — Sync + Content API + Auth complète

> Statut : **terminée**. Le serveur expose maintenant un flux d'auth
> complet (signup, login, magic link, OAuth2 Google, refresh), un
> middleware JWT devant les endpoints sensibles, et le protocole sync
> est authentifié bout-en-bout.

---

## 1. Ce qui a été livré (suite de la Phase 5)

```
backend/src/auth/                              Auth complet
├── auth.module.ts                             (refactor) providers JWT + Magic + Google + Email
├── auth.service.ts                            (refactor) + refresh() + issueAccessFor()
├── auth.controller.ts                         (refactor) + POST /auth/refresh
├── auth.dto.ts                                inchangé
├── jwt.guard.ts                               (nouveau) — middleware RS256/HS256
├── jwt.decorators.ts                          (nouveau) — @CurrentUser, @CurrentUserId
├── magic-link.service.ts                      (nouveau) — Resend + JWT magic token
├── magic-link.controller.ts                   (nouveau) — POST /auth/magic-link[/verify]
├── email-sender.service.ts                    (nouveau) — ResendEmailSender
├── google-oauth.service.ts                    (nouveau) — flow OAuth2 complet
└── google-oauth.controller.ts                 (nouveau) — GET /auth/google[/callback]

backend/src/srs-sync/srs-sync.controller.ts    (refactor) @UseGuards(JwtGuard)
backend/src/content/content.controller.ts      (refactor) @UseGuards(JwtGuard)
backend/test/integration/srs-sync.controller.test.ts
                                                (refactor) tests HTTP avec JWT signé
```

---

## 2. Le contrat de sync reste identique (c'est l'invariant)

Le protocole de synchronisation Phase 5 → Phase 6 n'a **pas bougé** :

  * `POST /v1/srs-sync/push { events: ReviewEvent[] }` ;
  * `GET  /v1/srs-sync/pull?since_ms=&limit=`.

Seuls les **headers** changent : on remplace `X-User-Id` par un
`Authorization: Bearer <jwt>`. Le format du `ReviewEvent` reste
identique au format Dart (mobile) — c'est l'invariant qui fait tenir
l'ensemble de l'architecture.

**Conséquence pratique** : le client mobile (à venir en Phase 8) a un
seul point de modification — son `SyncOutboxUseCase` ajoute un
intercepteur Dio qui injecte le JWT. Aucune autre adaptation.

---

## 3. Auth complète (Phase 6)

| Endpoint | Méthode | Usage |
|---|---|---|
| `/v1/auth/signup`               | POST  | Crée un utilisateur (email + display_name + faculty + study_year) |
| `/v1/auth/login`                | POST  | Login email (placeholder — magic link est la voie normale) |
| `/v1/auth/refresh`              | POST  | Rotation du refresh token (révoque l'ancien, en émet un nouveau) |
| `/v1/auth/magic-link`           | POST  | Demande un lien par email (anti-énumération) |
| `/v1/auth/magic-link/verify`    | POST  | Vérifie le token magic et émet access+refresh |
| `/v1/auth/google`               | GET   | Renvoie l'URL d'autorisation Google |
| `/v1/auth/google/callback`      | GET   | Callback web (redirect avec tokens) |

Tous les endpoints non-`/health` sont protégés par `JwtGuard` sauf
ceux d'auth eux-mêmes (sinon bootstrapping impossible).

### Anti-énumération

`POST /auth/magic-link` retourne `{ sent: true }` que l'email existe
ou non dans la base. C'est une protection de base contre l'énumération
d'utilisateurs (sinon un attaquant pourrait découvrir qui a un compte).

### Refresh token rotatif

Cf. doc v2 §6.1 : « refresh token (30j, rotation à chaque usage) ».

`auth.service.refresh()` :

  1. Hash le token reçu (sha256) ;
  2. Cherche la ligne correspondante en DB ;
  3. Vérifie `revokedAt IS NULL` et `expiresAt > now()` ;
  4. **Révoque** l'ancien token (UPDATE `revoked_at = now()`) ;
  5. Émet un nouveau couple access+refresh.

Un token réutilisé après rotation est détecté et rejeté.

### JWT RS256 + clé publique

Le `JwtGuard` lit la clé publique depuis `JWT_PUBLIC_KEY_PATH` (env).
En son absence, mode dev HS256 avec un secret statique. **Aucun token
n'est accepté en mode démo si ce secret fuit** — c'est documenté
dans le code.

---

## 4. Endpoints protégés — middleware `JwtGuard`

`backend/src/auth/jwt.guard.ts` est un `CanActivate` NestJS qui :

  1. Lit `Authorization: Bearer <token>` ;
  2. Vérifie la signature (RS256 si clé publique, HS256 sinon) ;
  3. Vérifie `payload.kind === 'access' | 'entitlement'` (séparation
     stricte des usages : un refresh token ne peut pas être utilisé
     pour appeler `/srs-sync`) ;
  4. Injecte `{ sub, did, kind, iat, exp }` dans `req.user`.

Les contrôleurs utilisent ensuite :

  * `@CurrentUserId() userId: string` — récupère `req.user.sub` ;
  * `@Headers('X-Device-Id') deviceId: string` — émis par le client.

---

## 5. Tests

`backend/test/integration/srs-sync.controller.test.ts` (refactor) :

  * Monte un vrai module NestJS ;
  * Substitue `DRIZZLE` par un fake (pas de PostgreSQL requis) ;
  * Signe un JWT avec le `JwtService` réel (secret dev) ;
  * Vérifie :
    - push authentifié fonctionne (200) ;
    - push non authentifié est rejeté (401) ;
    - batch > 100 rejeté (400) ;
    - pull authentifié retourne un next_cursor_ms (200) ;
    - health reste accessible sans auth (200).

C'est un **vrai test d'intégration HTTP** : il passe par le router
Express, le guard, le pipe Zod, le service, et le fake DB. Le seul
élément mocké est la base de données — tout le reste est réel.

---

## 6. Conformité au plan v2

| Exigence v2 | Phase | État |
|---|---|---|
| Auth Google OAuth2               | 6 | ✅ `google-oauth.{service,controller}.ts` |
| Magic link email                 | 6 | ✅ `magic-link.{service,controller}.ts` |
| Refresh token rotatif 30j        | 6 | ✅ `auth.service.refresh()` |
| OTP SMS (Twilio/InfoBip)         | 6+ | 🟡 non livré (Phase 6+ facultatif, on a déjà magic link) |
| Rate limiting 5 OTP/15min        | 7 | 🟡 Phase 7 (NestJS @nestjs/throttler) |
| Sync push/pull authentifié       | 6 | ✅ `JwtGuard` |
| Content delta par version        | 5+6 | ✅ (déjà livré en Phase 5) |
| Entité RefreshToken en DB        | 5+6 | ✅ `refresh_tokens` table |
| Audit log complet                | 11 | ⏳ Phase 11 (CMS) |

---

## 7. Pas livré (Phases suivantes)

  * **Phase 7** : Chargily Pay (CIB + BaridiMob), JWT d'entitlement
    RS256, grace period 14j, RBAC CMS 5 rôles, throttling.
  * **Phase 8** : Dio côté mobile pour consommer ces endpoints.
    Notamment le `RestSyncRepository` (Dart) remplacera
    `LocalSyncRepository`.
  * **Phase 11** : CMS Next.js pour le workflow éditorial
    (draft → review → published) — déjà préparé en DB
    (`cards.status`, `card_versions`).
  * **Phase 12** : Sentry, Prometheus, alerting.

## 8. Comment vérifier

```bash
cd backend
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate
npm test
npm run test:integration
npm run start:dev
```

Smoke test :
```bash
# signup
curl -X POST http://localhost:3000/v1/auth/signup \
  -H 'Content-Type: application/json' -H 'X-Platform: curl' \
  -d '{"email":"alice@medanki.dz","display_name":"Alice"}'

# sync (avec le token reçu)
curl -X POST http://localhost:3000/v1/srs-sync/push \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'X-Device-Id: test-device' \
  -d '{"events":[{"id":"00000000-0000-7000-8000-000000000001",...}]}'
```
