# Release Scope — Étape 3 : Schéma et données PostgreSQL réels

## Objectif

Prouver que la base de données MedLM peut être provisionnée intégralement
à partir de migrations SQL, peuplée par un seed déterministe, et que les
contraintes critiques sont respectées par PostgreSQL — pas par des mocks.

## Ce qui est livré

### Migration 0018 — intégrité MVP

`backend/src/db/migrations/0018_mvp_integrity.sql` complète les migrations
existantes sans les modifier :

- **Clés étrangères manquantes** : `modules→programmes`, `decks→modules`,
  `cards→decks`, `card_versions→cards`, `study_sessions→decks`.
- **Contraintes CHECK de domaine** :
  - `review_logs.rating ∈ {1,2,3,4}` ;
  - `cards.status ∈ {draft, published, archived}` ;
  - `cards.type ∈ {basic, cloze, image, audio}` ;
  - `srs_card_state.state ∈ {new, learning, review, relearning, buried}` ;
  - `entitlements.plan ∈ {free, premium}` ;
  - `users.rbac_role ∈ {student, author, admin, super_admin}` ;
  - `programmes.study_year ∈ [1,6]` ;
  - `modules.order_index ≥ 0` ;
  - `decks.version > 0` et `cards.version > 0`.
- **Unicité métier** : un seul entitlement premium actif par utilisateur.
- **pgcrypto** : extension créée si absente avant toute utilisation de
  `gen_random_uuid()`.

### Incohérence Drizzle corrigée

`backend/src/db/schema/srs.ts` référençait `cards.deckId` (colonne non
unique) pour `study_sessions.deck_id`. Corrigé vers `decks.id`, aligné sur
la FK créée en 0018.

### Seed déterministe et idempotent

`backend/src/db/seed.ts` — script transactionnel qui crée :

- 3 utilisateurs (`admin`, `author`, `student`) ;
- 1 programme, 1 module ;
- 1 deck gratuit publié, 1 deck premium publié ;
- 4 cartes publiées (2 par deck) ;
- 1 snapshot de version par carte ;
- 1 entitlement premium actif pour l’utilisateur `student`.

Le seed :

- échoue explicitement si `DATABASE_URL` manque ;
- échoue explicitement si le schéma PostgreSQL attendu manque ;
- échoue explicitement si les tables attendues ne sont pas disponibles ;
- est **versionné** via la table `seed_versions` ;
- est **transactionnel** (`BEGIN` / `COMMIT` / `ROLLBACK`) ;
- est **idempotent** : rejoué deux fois sans doublon ;
- est **rejouable** : UUIDs fixes, `ON CONFLICT` partout.

### Contrat PostgreSQL réel

`tools/scripts/check_database_contract.sh` vérifie contre PostgreSQL :

- 37 tables attendues ;
- utilisateurs et rôles seedés ;
- decks gratuit et premium publiés ;
- cartes publiées ;
- entitlement premium actif ;
- clés étrangères dans `pg_constraint` ;
- contraintes CHECK dans `pg_constraint` ;
- rejet d’un `rating = 5` ;
- rejet d’un deck orphelin (FK) ;
- append-only de `review_logs` (UPDATE refusé).

### CI

`.github/workflows/backend-ci.yml` exécute :

1. `npm run db:migrate` (1ʘʘ passe) ;
2. `npm run db:seed` (1ʘʘ passe) ;
3. `npm run db:migrate` (2e passe — rejouabilité) ;
4. `npm run db:seed` (2e passe — idempotence) ;
5. `./tools/scripts/check_database_contract.sh` ;
6. `npm run typecheck && npm run lint && npm run build && npm test && npm run test:integration`.

## Validation locale

```bash
cd backend
npm run db:migrate
npm run db:seed
npm run db:migrate
npm run db:seed
DATABASE_URL=postgres://medanki:medanki@127.0.0.1:5432/medanki_dz \
PG_SCHEMA=public \
bash ../tools/scripts/check_database_contract.sh
```

## Limites

- Le seed ne crée pas de `refresh_tokens` ni `user_devices` (pas requis
  par le scope MVP de cette étape).
- Les tests d’intégration existants substituent encore un fake Drizzle ;
  la preuve PostgreSQL est apportée par le contrat bash et le seed.
