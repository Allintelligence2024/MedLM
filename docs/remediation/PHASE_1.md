# Phase 1 — Premier lot de corrections : paiements et vérification JWT

> Bilan historique du lot 1. État courant : [lot 2](PHASE_1_LOT_2.md) et preuves `phase1-lot2/`. Les limites décrites ci-dessous sont celles du premier lot.
**Date : 26 septembre 2026. Statut : EN COURS, pas de GO production.**
Référence de départ : `228d3d62ee6f1156543e0786fa7cbdf1e42dbc12`, sur
`arena/01a0defd-medlm`. Les correctifs sont dans l'arbre de travail de cette branche.

## Ce qui a été corrigé

### 1. Plan commercial distinct du droit premium

Les commandes conservent leur SKU `monthly/semester/yearly/group` ; le crédit
écrit désormais **`premium`** dans `entitlements.plan`. La contrainte SQL
`free/premium` n'a pas été élargie pour masquer le bug.

Le test de régression a été exécuté **avant** correction : les quatre plans
échouaient sur `23514 entitlements_plan_check` (voir `phase1/red-billing.txt`).
Ces cas passent maintenant sur le vrai BillingService et Drizzle avec SQL exécuté.
Une ligne `free` avec une expiration future n'est plus considérée comme un droit
premium actif par `currentEntitlement`.

**Limite groupe :** le test du SKU `group` vérifie le mapping pour le propriétaire
de la commande. Il ne prouve PAS la distribution de cinq droits aux membres d'un
pack. Le parcours commercial groupe reste à compléter avant activation réelle.

### 2. Durée contractuelle stockée avant le paiement

Migration additive **0023_payment_order_duration** : ajout de `duration_days`
à `payment_orders`, avec durée positive et plafond explicite de 3650 jours.
L'application stocke le montant final et la durée issue de la promotion lors de
la création de commande. Le webhook ne prend plus la durée dans des métadonnées
ni dans la grille tarifaire qui peut évoluer après l'achat.

Un test modifie la promotion après checkout et envoie des métadonnées trompeuses :
l'utilisateur, le niveau de droit et la durée contractuelle restent ceux en base.
Les montants non entiers, gratuits/négatifs ou hors capacité SQL et les durées
invalides sont refusés dans ce parcours payant. Un don gratuit doit avoir un flux
séparé : il ne doit pas passer pour un encaissement Chargily.

### 3. Contrôles du webhook et crédit atomique

- `id`, montant entier positif et devise DZD sont obligatoires pour un paiement
  confirmé. Le montant/devise doivent correspondre à la commande.
- Le bénéficiaire vient exclusivement de la commande interne, pas de metadata.
- L'événement est acquis par INSERT unique `(event_id, provider)` dans la même
  transaction que l'attribution du droit. Un rollback libère le claim.
- La commande est verrouillée (`FOR UPDATE`) avant décision de crédit.
- Le propriétaire est aussi verrouillé : deux commandes différentes d'un même
  utilisateur ne perdent pas une prolongation, même sans droit préexistant.
- Les commandes déjà payées ne sont pas recréditées ; les états terminaux
  non payables ne sont pas crédités.
- Une référence pas encore persistée renvoie **503**, sans crédit ni claim durable.
  Une nouvelle livraison du même événement peut réussir après rapprochement.
  Aucune recherche permissive par `metadata.order_id` n'a été ajoutée.
- Le cast transaction → Database du crédit a été remplacé par le type réel
  dérivé de la transaction Drizzle.

Le provider conserve sa logique existante pour les notifications non confirmées.
La politique exhaustive de remboursements/annulations et leur réconciliation
ne sont pas déclarées terminées par ce lot.

### 4. JWT d'entitlement : vérification RS256 cohérente

La clé publique est chargée ou dérivée de `JWT_SIGNING_KEY_PATH` via le helper
partagé. L'absence de clé résoluble fait échouer la construction en production.
En dev sans clé, la vérification échoue explicitement : **jamais de repli HS256**.

La vérification exige également un payload d'entitlement avec `kind`, `exp` et
les champs attendus ; un token d'accès signé par la même clé est rejeté.
Le TTL lu dans l'environnement est converti en nombre et validé, afin qu'une
chaîne `"3600"` signifie 3600 secondes et non le format millisecondes de la
bibliothèque JWT.

Le test de dérivation échouait avant correction (voir `phase1/red-entitlement.txt`).
La politique d'expiration de l'abonnement, de grâce hors ligne et de révocation
sur mobile reste à finaliser ; le correctif du vérificateur ne vaut pas validation
de tout le paywall.

## Tests et preuves

| Vérification | Résultat |
|---|---|
| Régression paiement avant correction | 4 échecs SQL attendus, archivés |
| Régression dérivation JWT avant correction | 1 échec attendu, archivé |
| Tests unitaires complets | **538 réussis**, 39 fichiers |
| Tests d'intégration complets, avec serveur PG disponible | **82 réussis**, 8 fichiers, aucun skip |
| Parmi eux : billing SQL/HTTP sur PGlite | **27 tests** |
| Parmi eux : concurrence sur PostgreSQL 16.14 serveur | **3 tests** |
| Tests du runner Python | 6 réussis |
| Typecheck, lint et build backend | Réussis |
| Garde migrations statique | 39 tables déclarées, 23 migrations |

Deux tests billing à faux builder ont été remplacés par une couverture SQL plus
forte. Le compteur unitaire passe donc de 533 à 538 : −2 anciens tests fake,
+7 tests JWT. Le nombre de tests n'est pas une mesure de sûreté à lui seul.

### Concurrence : preuve réelle, pas seulement PGlite

Un serveur **PostgreSQL 16.14** éphémère a été lancé uniquement sur un socket Unix
local, sans port TCP ni connexion à une production. Les binaires proviennent du
package de test `@embedded-postgres/linux-x64@16.14.0-beta.17`, installé hors du
repo. Ce n'est pas une nouvelle dépendance du projet ni une image de déploiement.

Les tests utilisent plusieurs connexions indépendantes. Une troisième connexion
retient le verrou utilisateur ; `pg_stat_activity` doit montrer **deux transactions
en attente de verrou** avant libération. Cas exercés :

1. Deux livraisons concurrentes du **même événement** : un seul crédit.
2. Deux événements distincts pour **la même commande** : un seul crédit.
3. Deux commandes distinctes du même utilisateur : les deux durées s'additionnent.

Chaque suite crée et supprime son propre schéma. Les migrations, contraintes et
verrous s'exécutent vraiment. Seule la création du checkout externe est simulée.
Le serveur de test a été arrêté après validation.

### HTTP et signature

Les tests billing font également passer un événement par le vrai contrôleur Nest,
avec `rawBody` et HMAC : événement non signé refusé, événement signé crédité,
rejeu non crédité deux fois, payload incomplet pourtant signé refusé.
C'est une application de test ciblée sur ce contrôleur, pas une validation complète
de l'authentification utilisateur, du CMS ou des autres routes.

### Reproduire

```bash
cd backend
npm ci
npm run typecheck
npm run lint
npm test
npm run build

# Une base de TEST uniquement, avec permission de créer/supprimer un schéma.
BILLING_TEST_DATABASE_URL='postgresql://test_user@host/test_db' npm run test:integration
```

En CI, la configuration capture le `DATABASE_URL` du job avant que d'autres tests
HTTP ne le remplacent par leur URL factice. En local sans URL, les **trois tests
PostgreSQL serveur sont explicitement skipped**, pas présentés comme exécutés.
En CI sans URL, la suite échoue plutôt que de masquer l'absence de cette preuve.

Les journaux finaux sont dans `phase1/`. `green-billing.txt` est le passage ciblé
intermédiaire à 26 tests ; `integration.txt` contient la suite finale à 27 tests
billing / 82 intégration. Les preuves de phase 0 sont inchangées. Le runner courant
ne rejoue plus par défaut les assertions historiques qui exigeaient les anciens
bugs : l'option `--include-historical-reproductions` est réservée au snapshot initial.

## Déploiement et commandes historiques — ne pas improviser

Aucune migration de production n'a été exécutée.

1. Sauvegarder et tester la migration sur une copie avant toute mise en production.
2. Appliquer 0023 **avant** de déployer le code qui lit/écrit `duration_days`.
3. Les commandes existantes gardent `duration_days = NULL`. **Aucun backfill
   automatique ne devine les anciennes durées de promotion.** Inventorier :

```sql
SELECT id, provider_ref, plan, status, created_at
FROM payment_orders
WHERE duration_days IS NULL AND status = 'pending';
```

4. Rapprocher la durée à partir des preuves marchandes/provider puis corriger
   uniquement les commandes concernées, avec journal d'intervention. Tant que la
   durée n'est pas renseignée, le webhook retourne 503 et la transaction est annulée.
5. Prévoir une réconciliation des événements si la fenêtre de retries du provider
   est épuisée. Un 503 n'est pas une garantie de relivraison éternelle.
6. En rollback, suspendre les nouveaux achats, conserver les commandes/droits et
   la colonne ajoutée ; **ne pas supprimer la durée contractuelle ni rejouer les
   crédits déjà appliqués**. Revenir au vieux binaire ne répare pas son ancien bug.

## Ce qui bloque encore la clôture de phase 1

- **Contrat Chargily réel et sandbox.** Les tests préservent le contrat interne
  actuel en centimes. Les unités monétaires de l'API externe doivent être vérifiées
  explicitement avant encaissement. La documentation publique consultée montre
  aussi des champs/domaines différents du provider existant (`failure_url`,
  `customer_id`, metadata tableau, endpoint `pay.chargily.net`). Ne pas confondre
  réussite de la simulation et conformité API. Source :
  https://dev.chargily.com/pay-v2/api-reference/checkouts/create (consultée le 26/09/2026).
- Réservation/consommation des promos lors d'un abandon ou échec de création
  checkout : le provider promo incrémente encore à la demande, pas au paiement.
- Distribution des droits des **cinq membres du pack groupe**, non prouvée.
- Réconciliation automatique des checkouts interrompus, retries épuisés,
  remboursements/annulations ; suivi opérateur.
- Politique cohérente entre expiration du JWT, expiration du droit, grâce et
  révocation/offline ; test mobile réel.
- Test d'upgrade représentatif sur des données historiques et rollout/rollback.

**R01 et R06 restent `in_progress`.** Les défauts R02/R03 de lecture de contenu et
workflow, réservés à la phase 2, ne sont pas corrigés ici. La décision globale
reste **NO-GO production**.
