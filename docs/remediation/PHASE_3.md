# Phase 3 — Authentification, appareils, MFA admin, session CMS

Date : 2026-09-27. Branche : `arena/01a0defd-medlm`.
Décision inchangée : **NO-GO production**.

## Ce qui est fermé ici

- **R07** — `AuthService.refresh` fait `UPDATE … WHERE hash AND revoked_at IS NULL AND expires_at > now() RETURNING` dans une transaction. Un second concurrent voit 0 ligne. Un rejeu d’un jeton déjà révoqué révoque toute la famille. Preuve concurrence : `test/integration/auth-refresh-concurrency.postgres.test.ts` (PostgreSQL réel, `BILLING_TEST_DATABASE_URL`). PGlite ne simule pas deux connexions : ne pas l’invoquer comme preuve de CAS.
- **R08** — MFA admin dans le checkout, pas le batch Drive. HMAC-SHA1, pas de 30 s unix, secret AES-256-GCM (`MFA_KEK` 32 octets hex). Vecteur RFC 6238 t=59s → **287082** (6 chiffres), 94287082 (8). Le SHA1 simple Drive donne 119679 et est verrouillé en test unitaire comme contre-exemple. Backups consommés par `UPDATE … used_at IS NULL RETURNING`. Enrôlement refusé si MFA déjà actif. Remplacement en deux étapes (`replace/begin` + `replace/confirm`) : l'ancien secret reste actif jusqu'à confirmation du nouveau TOTP. Rate-limit `@Throttle` `long` 5/15 min. Audit `mfa.setup|enable|verify|backup|replace_*`.
- **PLAN item 5 (session CMS, pas R11)** — cookie `cms_access` HttpOnly/SameSite=Lax (+ Secure en production), refresh HttpOnly, proxy `/api/backend/*`, CSRF Origin/Referer = Host, rôles relus via `GET /v1/auth/me`. Le middleware Next appelle Nest `/v1/auth/me` : un cookie sans signature valide ne passe plus. Le login ne tape plus `POST /v1/auth/login` (410). `X-Platform: cms` produit un magic link `/admin/login?token=`.

## Appareils

Réutilisation par `X-Device-Id` / `device_token`. Plafond **3** appareils avec refresh encore valides. `POST /v1/auth/logout`, `POST /v1/auth/logout-all`, `DELETE /v1/auth/devices/:id`.

## Non-revendications (inchangées + précises)

- Pas de chiffrement de bout en bout des cartes. wrap-key n’enveloppe pas le JSONB.
- Pas d’objets R2. Presign média = 501. **R11 reste ouvert.**
- Pas de MFA sur les comptes non-admin.
- Pas de qualification appareil physique, Chargily sandbox, ni GO.
- Le middleware CMS échoue fermé si Nest est injoignable (pas de page admin « au cas où »).
- `MAGIC_LINK_CMS_URL` (sinon `MAGIC_LINK_BASE_URL`) + `X-Platform: cms` → `/admin/login?token=`. Le mobile reste sur `/auth/magic`.

## Preuves

- `backend/test/unit/totp.test.ts`
- `backend/test/integration/auth-mfa.postgres.test.ts`
- `backend/test/integration/auth-refresh-concurrency.postgres.test.ts`
- migration `0025_admin_mfa.sql`
