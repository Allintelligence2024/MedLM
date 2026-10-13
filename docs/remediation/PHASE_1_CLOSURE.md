# Phase 1 — Réception technique et réserve Chargily

Date : **27 septembre 2026**. Branche : `arena/01a0defd-medlm`.

## Périmètre confirmé par le propriétaire

- Publication sur cette branche et exécution de la CI GitHub autorisées.
- **Aucun client, commande ou abonnement réel existant**, selon confirmation du propriétaire. Pas de reprise de données de production à exécuter ; les tests d'upgrade peuplé restent conservés.
- **Aucun accès Chargily sandbox disponible.** La qualification externe n'est donc ni exécutée ni implicitement acceptée.
- Aucun déploiement de production effectué. Les phases 2–6 restent indépendantes.

## Derniers éléments livrés

1. Exécution distante des contrôles Flutter, puisque le SDK et les serveurs de paquets ne sont pas accessibles depuis le sandbox de développement.
2. Test interopérabilité **émetteur Nest réel → vérificateur RSA Dart réel** : clés éphémères, premium, gratuit, expiration, altération des claims. La clé privée n'est pas exportée. La fixture est générée dans le répertoire temporaire du runner, pas dans le dépôt. Elle est obligatoire en CI.
3. CronJob Helm de rapprochement : désactivé par défaut, suspendu à l'activation, approbation explicite requise avant désuspension, `concurrencyPolicy: Forbid`, aucun retry immédiat de job, limite de dix minutes, identité non-root, token Kubernetes non monté, secret externe uniquement.
4. La CLI ne traite par défaut que les commandes pending âgées d'au moins **35 minutes**, pour ne pas alerter sur les checkouts ordinaires encore en cours. `BILLING_RECONCILE_MIN_AGE_MINUTES` accepte un entier de 0 à 10080 ; 0 permet un diagnostic immédiat. **L'âge ne libère jamais une réservation** : seul le résultat distant rapproché le permet.
5. Tests du rendu Helm : absence par défaut, suspension, refus de configuration non approuvée, secret requis et mode production explicite.
6. Règle d'alerte fournie pour les exécutions sans succès récent, y compris un job qui n'a jamais réussi. Dépendance explicite : kube-state-metrics. Une règle versionnée n'est pas une alerte effectivement installée.

## Validation GitHub

La première CI complète du code `08b4504` a réussi pour le backend, PostgreSQL 16, Docker backend, Flutter (analyzer, tests interop et APK debug) et CMS. Le job de scripts a échoué au contrôle Helm : aucun succès global n'est revendiqué pour ce run.

Une dépendance obligatoire manquait à l'installation du job : PyYAML, importé par le checker Helm. `tools/requirements.txt` épingle maintenant PyYAML 6.0.2 ; les changements de dépendances et du chart déclenchent aussi la CI. Les échecs du checker produisent désormais une annotation avec diagnostic accessible depuis l'API GitHub. **Relance finale entièrement réussie : [run 36319139969](https://github.com/Allintelligence2024/MedLM/actions/runs/36319139969), code `591cc00e0fbdac5ef03838df7465a5e8df21024d`.**

| Contrôle final | Résultat |
|---|---|
| Unitaires backend (logs locaux finaux) | **549 PASS** |
| Intégration backend (logs locaux finaux) | **95 PASS**, aucun skip, serveur PostgreSQL 16.14 |
| CI PostgreSQL 16 | Migrations, seed, tests, parcours HTTP réel : PASS |
| CI Flutter | Génération Drift, analyze, tests complets dont interop backend RSA : PASS |
| APK Android debug | Build réussi ; pas un test sur appareil physique |
| Backend | Typecheck, lint, build, démarrage et image Docker : PASS |
| CMS | Typecheck et build Next : PASS (ne pas déduire un build Docker CMS du nom du job) |
| Helm / scripts | Rendu réel et garde-fous du CronJob : PASS |

La CLI a en plus été exécutée en subprocess contre un schéma PostgreSQL isolé : lecture correcte sans écriture et refus d'un acteur non administrateur. Elle respecte maintenant `PG_SCHEMA`, avec validation du nom et timeout de connexion. Le nom du CronJob est borné à la limite Kubernetes de 52 caractères.

Preuves : [`phase1-ci/final-run.json`](phase1-ci/final-run.json), résumé CI, logs locaux et manifeste d'empreintes dans [`phase1-ci/`](phase1-ci/). Les journaux complets distants n'ont pas pu être téléchargés dans ce sandbox ; les statuts des jobs et de leurs étapes proviennent directement de l'API GitHub, pas d'une reconstitution de logs. Les anciens runs annulés ne sont pas comptés comme réussites globales.

Avertissements CI non bloquants conservés : actions ciblant Node 20 exécutées sous Node 24 et future migration d'ubuntu-latest. Leur stabilisation reste dans la phase dépendances/release.

Les logs des lots précédents restent historiques : [lot 1](PHASE_1.md), [lot 2](PHASE_1_LOT_2.md).

## Mise en service du rapprochement — après qualification

Le chart ne lance aucun paiement ni rapprochement par défaut. Dans un environnement autorisé :

1. Utiliser l'image issue du SHA qualifié, pas un tag flottant `latest`.
2. Provisionner un Secret dédié avec `DATABASE_URL`, `CHARGILY_API_SECRET`, `BILLING_RECONCILE_ACTOR_ID` ; cet acteur doit être un administrateur opérateur existant. Ne pas placer ces valeurs dans le chart, les arguments de shell ou les journaux.
3. Activer `billingReconciliation.enabled=true`, renseigner `existingSecret`, choisir explicitement `environment=sandbox` ou `production`, conserver `suspend=true`.
4. Renseigner aussi `PG_SCHEMA` dans le Secret si le backend utilise un schéma autre que `public` (nom SQL simple en minuscules). Exécuter la CLI sans `--apply` dans cette image pour contrôler la connectivité et l'inventaire. Sans donnée réelle historique, aucune conversion manuelle de contrats v1 n'est nécessaire.
5. Qualifier les appels distants et les effets audités dans le staging sandbox, installer la règle `deploy/monitoring/billing-reconciliation-alerts.yml` et vérifier son routage vers un opérateur.
6. Seulement après acceptation : `qualificationApproved=true`, puis `suspend=false`. Surveiller les sorties non nulles : références absentes, données historiques inattendues, erreurs provider ou plafond de 1000 commandes.
7. En cas d'incident : suspendre le CronJob et les nouveaux achats, préserver le registre et l'audit. Ne pas réémettre aveuglément les POST de création, ni libérer le quota sur un simple timeout.

Les administrateurs disposent aussi de `POST /v1/billing/reconcile`, avec contrôle du rôle actuel en base et journalisation atomique. Cette route ne permet pas d'inventer un paiement ou une durée historique.

## Réserve externe non levée

La conversion choisie en DZD entiers, la forme des metadata, les frais à charge du marchand et la réception HMAC doivent être observés auprès de Chargily. Les tests HTTP locaux utilisent des réponses substituées : ils ne remplacent pas cette réception.

Checklist pour lever la réserve lorsqu'un accès sera fourni par un gestionnaire de secrets :

- Montant réellement affiché : mensuel 350 DA ; promotion arrondie selon le devis ; groupe selon son plan sous-jacent.
- Livraison réelle du webhook signé, avec corps brut, puis rejeu sans double crédit.
- Simulation contrôlée d'une réponse perdue : une seule création, référence retrouvée et rapprochement audité.
- Abandon/expiration : aucune utilisation promo consommée et réservation libérée uniquement après constat distant terminal.
- Groupe : cinq comptes distincts crédités une fois ; aucun accès au sixième membre.
- Réconciliation planifiée et alerte d'échec réellement observées dans le staging.

Le remboursement automatique reste **désactivé**, faute de contrat provider vérifié. Il n'existe pas de remboursement fictif déclaré réussi. Toute activation de remboursements manuels externes demande d'abord une procédure approuvée de révocation des droits ; ne pas annoncer cette capacité aux clients.

## Décision

**Implémentation et réception technique validées. R01 et R06 fermés sur leurs défauts précis ; réserve externe R15 ouverte. Aucun GO production.** Sans sandbox, on peut réceptionner l'implémentation et ses tests, mais on ne peut pas déclarer toute la qualification paiement terminée. Les tests sur appareils physiques, la rotation de clés en déploiement et la résistance aux changements d'horloge relèvent encore de la qualification mobile/release de phase 6.
