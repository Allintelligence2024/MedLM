# Phase 5 — Dépendances, CMS et déploiement (R10, R11, R12)

Date : 2026-09-27. Branche : `arena/01a0defd-medlm`.
Décision inchangée : **NO-GO production**. Pas de cluster, pas de R2 live,
pas de Chargily.

## Ce qui est fait ici

- **R10** — triage npm (backend 53, CMS 29 à la revue). `nanoid` forcé
  à `3.3.18` (override). Next pin `14.2.35`, TipTap pin `2.27.3`.
  Nest reste **10.4.x** (dernier 10.4.22 déjà résolu). Pas de
  `npm audit fix --force`. Les sauts Nest 12 / Next 15–16 / Vitest 5 /
  drizzle-orm 0.45 sont **exclus** : majeurs, hors lot réduit.
  Justifications : [advisories.md](advisories.md).
- **R11 (code)** — session CMS HttpOnly+CSRF déjà en phase 3.
  Catalogue staff : `GET /v1/content/cards/list` via cookie
  (`serverBackendFetch`) + liens d'édition. Presign média : SigV4
  S3/R2 si `R2_*` complets, **501** sinon, jamais d'URL fictive.
  CMS : message 501 honnête. Pages hors MVP sorties de la nav
  primaire (bannière).
- **R12 (manifests)** — déjà patché en `7188eca` (`/v1/healthz`,
  `/v1/readyz`, `JWT_SIGNING_KEY_PATH` fichier). Contrôle statique
  ajouté dans `check_dockerfiles.py`. **Pas de cluster** : R12 reste
  ouvert.

## Non-revendications

- Pas d'upload R2 réel. Pas d'E2E navigateur CMS+Nest.
- Pas de restauration backup, rollback, secrets en live.
- Next 14.2.35 ne ferme pas toutes les advisories RSC (correctifs
  15.x / 16.x seulement).
- drizzle-orm 0.36.4 : advisory identifiants SQL ; pas d'usage de
  `sql.identifier` / `sql.as` dans ce dépôt.

## Preuves

- `backend/test/unit/media_storage.test.ts`
- `backend/test/integration/content-access.postgres.test.ts` (501 sans R2)
- `docs/remediation/advisories.md`
- CMS `layout.tsx` (nav MVP vs hors MVP)
- `tools/scripts/check_dockerfiles.py` (`check_helm_jwt_probes`)
