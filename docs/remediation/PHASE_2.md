# Phase 2 — Autorisations du contenu et workflow

Branche : `arena/01a0defd-medlm`.
Défauts : R02 (lecture premium/brouillon), R03 (auto-publication).

## Politique

| Rôle | Lecture apprenant | Lecture CMS | Transitions |
|---|---|---|---|
| student | publié ; premium si entitlement actif | refusée | aucune |
| author | comme student + ses brouillons | ses cartes seulement | `draft → review` (ses cartes) |
| medical_reviewer | tout statut | toutes les cartes | `review → approved/draft` sauf les siennes |
| editor | tout statut | toutes les cartes | publication et retrait, sauf ses propres cartes |
| admin | tout | tout | comme editor ; dérogation d'auto-approbation **commentée et auditée** |

- Brouillon pour un non-ayant-droit : **404**, pas 403.
- Carte **publiée premium** sans entitlement : **403**.
- Catalogue : un deck premium publié peut apparaître (paywall). Contenu, hints, examens, wrap-key : entitlement.
- Cross-user : un auteur ne lit/édite/soumet que ses cartes.
- Catalogue **global** : pas de `tenant_id` sur les cartes. Pas d'isolation multi-tenant du contenu.

## Accès premium couverts

| Voie | Contrôle |
|---|---|
| `GET /content/decks` | publié seulement (métadonnées) |
| `GET /content/decks/:id/cards` et `GET /content/cards/:id` | publié + entitlement |
| `GET /content/cards/list` | staff ; auteur = ses cartes |
| `GET /ai/hints/:cardId` | même politique que la lecture de carte |
| `POST /exams/templates/:id/generate` | pioche publiée du **module** ; 403 si le pool accessible exige le premium |
| onboarding (recommandations) | decks avec `published_at` |
| `GET /decks/:id/wrap-key` | publié + premium + entitlement |
| `POST /content/media/presign` | auteur+ ; **501** (R2 non provisionné, aucune URL publique fictive) |
| médias dans le JSON d'une carte | uniquement si la lecture de la carte est autorisée |

Téléchargement apprenant = `GET /content/decks/:id/cards`. Il n'existe pas de bundle chiffré côté serveur.

## Tests

- 20 tests unitaires de matrice (`test/unit/content_policy.test.ts`).
- 8 tests HTTP+SQL (`test/integration/content-access.postgres.test.ts`) : gratuit/premium/brouillon, auteur vs autrui, workflow, dérogation admin, wrap-key, **hints/examens/médias**, onboarding, et preuve que wrap-key **ne transforme pas** les cartes en ciphertext.

569 unitaires ; 95 intégrations PGlite locales. Concurrence PostgreSQL réelle : CI.

## Ce que « 100 % phase 2 » ne signifie pas

- **Pas de chiffrement de bout en bout.** Les cartes restent du JSONB en clair sous TLS. wrap-key délivre une AES aléatoire wrappée RSA, non utilisée pour chiffrer les lignes `cards`. C'est vérifié par test, pas une omission cachée. Le critère du plan était de *vérifier le lien* et de *cesser de l'affirmer*.
- Stockage R2 réel : phase 5 (R11).
- Appareil physique / hors-ligne : phase 6.
- Qualification Chargily : R15, toujours bloquée.
- Aucun déploiement. **NO-GO production.**

R02 et R03 fermés pour leurs défauts précis.
