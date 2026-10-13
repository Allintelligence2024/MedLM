# Phase 0 — Bilan d'exécution

**Statut : terminée pour le cadrage et la collecte locale. Sécurité non corrigée.**
**Décision de livraison : NO-GO.**

## Référence

- HEAD : `228d3d62ee6f1156543e0786fa7cbdf1e42dbc12`.
- Branche : `arena/01a0defd-medlm`.
- Exécution : 2026-09-26, 18:53:36–18:55:10 UTC.
- Empreinte SHA-256 agrégée du périmètre backend/cms/mobile/tools/.github :
  `72536acd5063e5621b77113f5940ebc095fd6de487d189dc43ebb7b63ad8ade9`.
- Arbre de travail non propre : les documents de revue/remédiation et le runner
  sont des ajouts locaux. Ce n'est donc pas une déclaration que tous les fichiers
  testés sont déjà dans HEAD. Les hashes individuels sont dans le manifeste.
- Pas de changement des sources métier ni des lockfiles. Aucun déploiement.

## Livrables

- [Plan et critères de sortie](PLAN.md) : phases 0 à 6.
- [Registre des risques](risks.json) : 14 risques ouverts, niveau de preuve,
  version concernée, phase et critère de clôture ; quatre affirmations exclues
  du diagnostic actuel.
- Runner : `tools/scripts/remediation_baseline.py`.
- Tests du runner : `tools/scripts/test_remediation_baseline.py`.
- [Manifeste d'exécution](baseline/summary.json) : commandes, version Node/npm,
  statuts, hashes, état Git et limites.
- Journaux et réponses npm audit dans `baseline/`. Les suffixes `.log` ont été
  archivés en `.txt` pour ne pas être ignorés par Git.

## Résultats

**19/19 étapes de collecte PASS**, empreinte source inchangée pendant l'exécution.
**6/6 tests du runner PASS**, notamment prérequis manquant → BLOCKED et erreur
réseau npm audit → FAIL, plutôt qu'un succès trompeur.

| Contrôle | Résultat |
|---|---|
| Typecheck, lint et build backend | PASS |
| Tests unitaires backend | 533/533, 38 fichiers |
| Tests d'intégration backend | 52/52, 6 fichiers |
| Build CMS | PASS |
| Garde workflows avec PyYAML réellement installé | PASS |
| Gardes Docker, migrations statiques, sécurité, i18n | PASS dans leurs périmètres |
| Garde Dart statique | PASS avec avertissement sur le généré absent |
| Audit backend complet | 53 entrées vulnérables, dont 1 critique (outil dev) |
| Audit backend runtime | 31 entrées, 0 critique, 5 hautes |
| Audit CMS | 29 entrées, 1 critique, 2 hautes |
| Reproduction des défauts connus | Défauts toujours présents, assertions du diagnostic réussies |
| Calcul indépendant TOTP du batch | Incompatibilité confirmée |

**Attention : PASS d'un audit signifie que son JSON a été collecté et validé,
pas absence de vulnérabilités. PASS de `known-defects-reproduction` signifie
que les bugs attendus ont été observés, pas qu'ils sont corrigés.**

## Défauts reproduits et conservés comme référence

1. Le vrai BillingService sur Drizzle/PGlite refuse de créditer la commande
   mensuelle : `23514 entitlements_plan_check`.
2. Une carte premium en brouillon est retournée par le vrai ContentService ;
   le vrai RbacGuard autorise le rôle student sur le handler de lecture.
3. Un auteur passe le guard de transition et peut faire seul
   `draft → review → approved → published` dans le service.
4. Sans clé publique explicite, le vérificateur entitlement rejette les jetons :
   défaut de configuration confirmé, pas exploitation HS256 démontrée.
5. Le calcul retranscrit du MFA Drive diffère du TOTP standard ; ces fichiers
   ne sont pas présents dans le checkout courant.

Ces reproductions sont des diagnostics ciblés, pas un pen test exhaustif ni
un parcours HTTP complet sur PostgreSQL 16. PGlite exécute le moteur SQL ;
l'installation `pgcrypto` est omise comme dans le test du dépôt. Le provider
paiement est simulé. Aucun argent ou service réel n'est impliqué.

## Ce qui reste explicitement non exécuté

- Build Flutter, plateformes natives et appareil réel.
- Serveur PostgreSQL 16, concurrence multi-connexion de production, restauration.
- Images Docker, Helm et cluster Kubernetes.
- Chargily sandbox/live, FCM et APNs réels.
- Validation clinique, contrat de partenariat ou conformité juridique.

Ces limites ne bloquent pas la clôture de **la collecte locale de phase 0** ;
elles bloquent toute extrapolation vers une qualification de production et
font partie des critères d'acceptation des phases suivantes.

## Prochaine étape : phase 1

Commencer par un test de régression du paiement qui attend un **droit premium
créé**, et qui échoue avant le correctif. Couvrir les quatre plans, puis promos,
montants/devises, rejeu et concurrence. Le défaut doit être corrigé à la frontière
SKU commercial → droit d'accès, pas en assouplissant arbitrairement le CHECK SQL.
Les diagnostics historiques restent figés ; ils ne doivent pas devenir une garde
CI permanente qui exige que les bugs restent présents.
