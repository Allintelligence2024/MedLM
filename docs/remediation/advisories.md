# Triage npm — phase 5 / R10

Date : 2026-09-27. Commandes : `cd backend && npm audit --json`,
`cd cms && npm audit --json`. **Pas de `npm audit fix --force`.**

Comptes à la revue : backend 53 (1 critical, 11 high, 37 moderate, 4 low),
CMS 29 (1 critical, 2 high, 26 moderate).

## Correctifs appliqués (lot réduit)

| Paquet | Avant | Après | Motif |
|---|---|---|---|
| `nanoid` (transitif, backend+CMS) | 3.3.16 | **override 3.3.18** | GHSA-2v37-7h3g-55p8 (boucle si `size=0` sur générateur custom). Dev/build, pas un chemin HTTP. |
| `next` | `^14.2.15` → 14.2.35 déjà résolu | **pin 14.2.35** | Dernier 14.2. Évite un float vers 15. |
| `@tiptap/*` | `^2.8` → 2.27.2 | **pin 2.27.3** | Dernier 2.x. |

Nest 10.4.22 et vitest 2.1.9 étaient déjà les derniers de leur ligne
majeure résolus par le lockfile.

## Exclusions documentées (pas un silence)

### Runtime backend

| Advisory | Paquet | Décision |
|---|---|---|
| GHSA-gpj5-g38j-94v9 SQLi identifiants | `drizzle-orm` `<0.45.2` (0.36.4) | **Accepté temporairement.** Fix = 0.45.2 (saut majeur schéma/kit). Grep : aucun `sql.identifier` / `sql.as` ; `sql.raw` n'interpole pas d'entrée utilisateur (`stats.service` commente l'interdiction). Revoir avant GO. |
| multer / body-parser DoS | via `@nestjs/platform-express` 10.4.22 | **Accepté.** Fix npm = Nest **12**. Hors lot. Upload CMS passe par presign R2, pas multer. |
| GHSA-36xv-jgw5-4q75 injection | `@nestjs/core` | **Accepté.** Fix = Nest 12. |
| lodash `_.template` / js-yaml merge | via `@nestjs/swagger` | **Accepté.** Fix = Nest 12. Chemin Swagger, pas le checkout JSON. |
| file-type boucle ASF / zip bomb | via `@nestjs/common` 10.4.22 | **Accepté.** Fix non dispo sur Nest 10. Pas d'upload binaire au serveur. |
| qs DoS | express | **Accepté.** Override risqué pour Nest 10. |

### Dev / CI seulement

| Advisory | Paquet | Décision |
|---|---|---|
| GHSA-5xrq-8626-4rwp lecture de fichiers (Vitest UI) | `vitest` `<=4.1.10` (2.1.9) | **Accepté.** Fix = Vitest 5. CI lance `vitest run`, pas le serveur UI. |
| vite / esbuild / picomatch / glob / tmp | `@nestjs/cli`, vitest, drizzle-kit | **Accepté.** CLI et tests, pas le binaire `node dist/main.js`. |
| Sentry / OpenTelemetry baggage | `@sentry/node` 8.x | **Accepté.** Fix = Sentry 11. SENTRY_DSN vide en CI. |

### CMS runtime

| Advisory | Paquet | Décision |
|---|---|---|
| RSC DoS / smuggling (plusieurs GHSA) | `next` 14.2.35 | **Accepté jusqu'à migration Next 15.** Vercel ne patche plus la 14 pour une partie des RSC. Next 15 casse `cookies()` / middleware (CMS en dépend). App Router CMS, donc exposé en théorie. Mitiger : CMS admin authentifié, pas public. Revoir avant exposition internet. |
| postcss sourceMappingURL | bundlé dans next 14 | **Accepté.** Build-time, CSS du repo. Fix upstream Next 16. |
| GHSA-cp6q-959q-f8rh `mergeAttributes` | `@tiptap/core` ≤3.30.3 | **Accepté.** Fix = TipTap 3.31 (majeur). Éditeur CMS, auteurs authentifiés. |

## Ce qui serait un autre chantier (hors phase 5)

1. Nest 10 → 12 (multer, swagger, core).
2. Next 14 → 15.5 (RSC), React 19 si 16.
3. drizzle-orm 0.36 → 0.45 + drizzle-kit 0.31 + regen migrations.
4. vitest 2 → 5.

Aucun de ces sauts n'a été tenté ici : le plan exige des lots réduits
et des tests. Les faire dans le même commit que le presign R2 aurait
brouillé la cause d'une régression.
