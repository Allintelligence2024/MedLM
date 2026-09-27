# Phase 2 — Autorisations du contenu et workflow

Branche : `arena/01a0defd-medlm`.
Référence des défauts : R02 (lecture premium/brouillon), R03 (auto-publication).

## Politique retenue

| Rôle | Lecture apprenant | Lecture CMS | Transitions |
|---|---|---|---|
| student | publié ; premium si entitlement actif | refusée | aucune |
| author | comme student + ses brouillons | ses cartes seulement | `draft → review` (ses cartes) |
| medical_reviewer | tout statut | toutes les cartes | `review → approved/draft` sauf les siennes |
| editor | tout statut | toutes les cartes | publication et retrait, sauf ses propres cartes |
| admin | tout | tout | comme editor ; dérogation d'auto-approbation **explicitement demandée, commentée et auditée** |

- Les lectures apprenant (`GET /content/decks`, `GET /content/decks/:id/cards`, `GET /content/cards/:id`) ne révèlent pas un brouillon : **404**, pas 403.
- Un étudiant sans droit sur une carte **publiée premium** reçoit **403** `entitlement premium requis`.
- Le catalogue peut lister un deck premium (métadonnées, paywall). Le contenu des cartes, le détail et `wrap-key` exigent l'entitlement.
- Un auteur ne lit, n'édite et ne soumet que **ses** cartes. C'est la règle cross-user.
- Le catalogue n'a **pas** de `tenant_id`. La politique est un catalogue global publié, pas une isolation multi-tenant du contenu. Aucun test ne prétend le contraire.

## Ce qui est testé

- 20 tests unitaires de la matrice (`test/unit/content_policy.test.ts`).
- 6 tests HTTP + SQL PGlite (`test/integration/content-access.postgres.test.ts`) :
  - étudiant gratuit : pas de brouillon, pas de cartes premium, pas de liste CMS ;
  - étudiant premium : publié seulement ;
  - auteur : pas le brouillon d'un autre ;
  - auteur : ne peut ni approuver ni publier ; relecteur puis éditeur distincts le peuvent ; versions et audit persistés ;
  - admin propriétaire : publication refusée sans dérogation, acceptée avec commentaire et action `content.card.admin_override` ;
  - `wrap-key` : 404 si non publié, 403 sans entitlement, 200 avec les deux.

569 tests unitaires et 93 tests d'intégration PGlite locaux passent. Les 8 tests de concurrence PostgreSQL restent conditionnés à `BILLING_TEST_DATABASE_URL` (exécutés en CI).

## Ce qui n'est pas démontré

- **Pas de chiffrement de bout en bout.** Les cartes restent du JSONB en clair, servies en TLS. `wrap-key` délivre une clé AES aléatoire liée à (utilisateur, appareil, deck) **après** contrôle d'entitlement, mais cette clé n'est pas utilisée pour chiffrer les lignes `cards`. Le commentaire de service le dit explicitement.
- `POST /content/media/presign` reste un stub d'URL. L'autorisation d'objets R2 est la phase 5 (R11).
- Les hints IA ne sont plus calculés sur un brouillon ; ils ne revérifient pas l'entitlement premium.
- Les examens ne piochent plus que des cartes `published` ; ils ne revérifient pas l'entitlement.
- Pas de qualification appareil physique ni de parcours hors-ligne de déchiffrement (phase 6).
- Pas de déploiement.

**R02 et R03 sont fermés pour leurs défauts précis. Aucun GO production.**
