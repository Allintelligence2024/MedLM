# Phase 1 — Deuxième lot : livraison et qualification restante

> Bilan historique du lot 2. La validation Flutter/CI et le statut courant sont décrits dans [la réception finale](PHASE_1_CLOSURE.md).

**26 septembre 2026 — corrections locales livrées ; phase non clôturée pour production.**
Branche : `arena/01a0defd-medlm`. Aucun déploiement, paiement réel ni migration de production.
Ce bilan remplace les travaux restants du [premier lot](PHASE_1.md), sans modifier ses preuves historiques.

## Résultat vérifié

| Contrôle exécuté | Résultat |
|---|---|
| Backend unitaires | **549 PASS**, 40 fichiers |
| Backend intégration | **93 PASS**, 8 fichiers, **aucun skip** |
| SQL métier / HTTP brut signé | 35 tests PGlite, vrais migrations/Drizzle/services |
| PostgreSQL serveur **18.4**, connexions indépendantes | 6 tests : 3 courses de crédit, dernière promotion, cinquième place, upgrade avec commandes historiques |
| TypeScript / ESLint / build Nest | PASS |
| Vérification statique migrations / sécurité | PASS — ces checkers ne prouvent pas l'absence de vulnérabilités |
| Checker statique Dart du dépôt | PASS avec avertissement existant `app_database.g.dart` absent ; **ce n'est pas `flutter analyze`** |
| CLI de rapprochement | Compilation/typecheck/lint et `--help` exécutés ; traitement métier testé par les tests SQL du service |
| Flutter analyze / tests / appareils | **BLOCKED** : SDK Flutter/Dart absent |
| Chargily sandbox / CIB / EDAHABIA réels | **NON EXÉCUTÉS** |

Logs et empreintes : [`phase1-lot2/`](phase1-lot2/). Le précédent lot utilisait PostgreSQL 16.14 ; le serveur temporaire de ce lot est 18.4. Il faut encore rejouer sur la version exacte du déploiement. Les tests SQL n'appellent pas Chargily ; les tests du contrat HTTP substituent `fetch`.

## Corrections

### 1. Adaptateur Chargily v2

- Domaine API `.net`, URLs test/live cohérentes avec le mode, Bearer utilisant **la clé secrète**, également utilisée pour le HMAC. La clé publique `CHARGILY_API_KEY` n'est plus utilisée par cet adaptateur.
- `failure_url` remplace `cancel_url` ; suppression de `customer_email` non documenté. Frais explicitement à la charge du marchand.
- Stockage interne en centimes ; contrat v2 envoyé en **dinars entiers** : 35 000 centimes → `amount: 350`. Conversion inverse pour contrôler un paiement reçu.
- Promotions arrondies au dinar lors du devis, avant persistance : 350 DA −15 % → 298 DA. Pas d'arrondi caché au moment du crédit. Les paiements gratuits passent hors de ce parcours.
- Réponse checkout contrôlée : référence, montant, DZD, état pending, mode si présent, URL HTTPS sur les domaines Chargily attendus. Les retours client sont limités à `https://medanki.dz` ; l'en-tête Origin n'est plus une autorité.
- Aucun retry automatique des **POST** : une réponse perdue ne doit pas créer plusieurs checkouts. Les GET ont des retries bornés ; timeout 20 s par tentative, redirections HTTP refusées.
- Le webhook exige le **corps brut** et une signature valide, sinon **403**. Un événement paid exige aussi un état `paid`.
- Si le webhook omet la devise, consultation authentifiée du checkout avant transaction SQL. Aucun défaut implicite à DZD ; un checkout encore pending ne crédite rien.
- Health check sur `/balance`. Suppression du remboursement supposé : `refund()` retourne explicitement `ok: false`, jamais une réussite inventée.

**Limite documentaire importante :** la documentation officielle lue indique « amount integer », sans nommer explicitement son unité. L'interprétation en DZD est corroborée par un SDK tiers indiquant `amount: 2000 // 2000 DZD`. Les tests figent ce contrat choisi, **ils ne le certifient pas auprès de Chargily**. Vérifier l'affichage exact de 350 DA, les frais, la forme de metadata et la réponse signée en sandbox avant activation. Aucune conversion silencieuse des commandes historiques.

Sources consultées :
- [Création officielle](https://dev.chargily.com/pay-v2/the-quick-guide/create-a-checkout.md) : domaine et authentification.
- [Paramètres officiels](https://dev.chargily.com/pay-v2/api-reference/checkouts/create.md) : champs, frais, metadata décrite comme array.
- [Objet checkout](https://dev.chargily.com/pay-v2/api-reference/checkouts/checkout-object.md) : metadata décrite comme dictionnaire — incohérence documentaire à qualifier.
- [Webhooks](https://dev.chargily.com/pay-v2/webhooks.md) : HMAC et exemple sans devise ; seule la première partie avait été lue lors de l'investigation.
- [SDK Flutter tiers](https://pub.dev/documentation/chargily_pay/latest/) : exemple explicite en DZD, **pas une source officielle ni une preuve sandbox**.

### 2. Promotions transactionnelles

La résolution ne consomme plus une utilisation. Sous verrou de la promotion, la capacité disponible est `maxUses - usedCount - commandes pending réservées`. L'insertion de la commande appartient à cette même transaction.

Le paiement consomme une seule utilisation, dans la transaction qui crédite les droits. Une erreur définitive 400/401/403/422 à la création libère la réservation. Une coupure réseau, un timeout, une réponse incohérente ou un 5xx **la conserve** jusqu'au rapprochement : une absence de réponse n'est pas une preuve d'absence de paiement.

Le temps écoulé seul ne libère pas le quota. Le rapprochement d'un état distant failed/canceled/expired le libère. Les anciens compteurs de promotions ne sont pas décrémentés arbitrairement : leurs usages historiques demandent des preuves.

### 3. Packs groupe réels

- Création pack + coordinateur atomique ; jointure sous verrou du pack, vue lue dans la transaction, refus du sixième membre.
- Lecture des membres réservée aux membres du pack : connaître l'UUID ou le code ne suffit plus à lire leurs emails.
- Achat via `POST /v1/billing/checkout`, `{ "plan": "group", "group_pack_id": "UUID" }`. Coordinateur, pack complet et non expiré exigés. Le prix et la durée proviennent du plan sous-jacent monthly/semester/yearly du pack.
- Cinq bénéficiaires distincts figés dans `payment_order_beneficiaries` lors de la commande. Une seule commande pending/paid par pack, avec index unique SQL.
- Crédit des cinq comptes dans une transaction ; verrous utilisateurs pris dans l'ordre des UUID. Une panne au deuxième crédit annule aussi le premier, l'événement et le changement d'état.
- Un pack expirant **après** création de son checkout ne détruit pas le contrat payé. Rejouer le paiement ne prolonge aucun membre deux fois.
- L'API mobile de création de checkout accepte désormais `groupPackId`. Le parcours UI groupe complet sur appareil n'est pas qualifié.

### 4. Rapprochement audité

`POST /v1/billing/reconcile` exige JWT + rôle admin, puis relecture du rôle admin **actuel en base**. Exemple de corps sans secret :

```json
{
  "order_id": "UUID de commande",
  "provider_ref": "référence retrouvée dans Chargily si manquante localement",
  "reason": "Récupération après timeout de création"
}
```

Le service consulte le provider lui-même. Pour rattacher une référence absente, son metadata distant doit désigner exactement la commande ; montant/devise doivent aussi correspondre. Les métadonnées d'un webhook ne permettent toujours pas ce rattachement automatique. L'action est inscrite dans `audit_log`, atomiquement avec ses effets. Le même crédit reste idempotent après rapprochement et replay du webhook.

Une CLI d'exploitation est fournie :

```bash
# Développement : avec dépendances installées et variables injectées
cd backend
npm run billing:reconcile -- --help
npm run billing:reconcile                 # lecture seule, pas d'appel Chargily
npm run billing:reconcile -- --apply       # consultations provider + effets audités

# Après build, utilisable sans tsx/devDependencies
node dist/billing/reconcile.cli.js --apply
```

Injecter `DATABASE_URL`, `BILLING_RECONCILE_ACTOR_ID` (UUID d'un compte opérateur admin existant), `CHARGILY_ENV` et `CHARGILY_API_SECRET` par le gestionnaire de secrets. Ne pas les mettre dans des arguments, des logs ou le dépôt. Le rôle courant est recontrôlé par le service pour chaque commande. Lecture par pages de 100, plafond 1000 commandes par exécution ; sortie 2 = unresolved/backlog, sortie 1 = erreur globale. Une commande encore pending est signalée, pas déclarée payée.

**À déployer, pas exécuté ici :** planifier ce job sous identité d'exploitation contrôlée, surveiller ses sorties et traiter les références absentes ainsi que le plafond de backlog. Le script seul n'est pas un ordonnanceur. Un refus/timeout distant laisse la commande en attente, avec alerte opérateur ; ce n'est pas un remboursement.

### 5. Expiration et mobile

- `expires_at` signé = échéance de l'abonnement ; `exp` = échéance cryptographique du JWT. La réponse contient aussi `token_expires_at`. Un compte gratuit a `expires_at: 0`, pas une journée premium implicite.
- Le repository REST demande maintenant `/v1/entitlement/jwt` **avant** d'utiliser le cache ; il vérifie kind, utilisateur, appareil, plan et forme des dates. Il ne réécrit jamais l'identité de session depuis un token d'entitlement.
- Cache permis sur `NetworkException` uniquement, après vérification cryptographique et d'identité. Un 401, un refus ou une réponse invalide ne deviennent pas un succès offline.
- Grâce impossible pour un plan free ou une signature invalide. Échéance et grâce sont plafonnées par `exp`, expiration refusée à l'égalité.
- L'ancien adaptateur Drift sans signature est déprécié et refuse le premium ; il n'est pas le repository câblé par défaut.

**Politique conservatrice explicite :** avec un JWT de 24 h, la grâce stockée de 14 jours ne donne pas 14 jours d'accès après expiration du JWT. Le client ne peut pas assurer une révocation immédiate hors ligne ni résister seul à une horloge locale manipulée. Une garantie commerciale offline différente exige une décision produit et une qualification dédiée, pas un bypass de `exp`.

Onze tests Dart de repository ont été ajoutés ; une ancienne assertion autorisant la grâce sans signature a été inversée. **Ils ne sont pas déclarés PASS sans SDK Flutter.**

## Migration et exploitation

1. Suspendre les nouveaux achats et sauvegarder le registre ; arrêter les anciens writers.
2. Appliquer **0023 puis 0024** avant le nouveau binaire. Aucune migration préexistante appliquée n'a été réécrite.
3. 0024 ajoute version de contrat, référence promo, pack, URL checkout et bénéficiaires ; ajoute l'état expired et l'unicité du paiement actif par pack.
4. Le défaut SQL `contract_version = 1` reste volontaire : un ancien writer ne doit jamais produire implicitement un contrat v2. Le nouveau service écrit explicitement 2.
5. Les commandes historiques gardent montant/durée inchangés. Seuls les bénéficiaires individuels non ambigus sont recopiés. Un ancien pack n'est pas transformé arbitrairement en cinq achats.
6. Les commandes v1 restent bloquées à l'attribution automatique. Faire examiner facture, montant réellement encaissé, durée contractuelle et bénéficiaires ; journaliser toute intervention approuvée. **Ne pas changer version/durée en masse pour faire passer les tests.** L'endpoint de rapprochement ne propose pas de contournement v1.
7. Configurer le webhook HTTPS brut dans le dashboard Chargily ; planifier et surveiller le rapprochement. Vérifier l'accès à la clé publique RSA réellement embarquée dans le mobile.
8. Rollback : suspendre les achats, préserver commandes/audit/bénéficiaires. Ne pas redéployer l'ancien code de crédit sur un trafic vivant.

## Ce qui empêche encore la clôture

- Qualification sandbox du montant affiché, metadata, frais, HMAC, reprise réseau, livraison et rapprochement ; pas de clés/test provider utilisables ici.
- Exécution Flutter/analyzer/génération Drift, vrai JWT backend → mobile, changements de compte/appareil, offline/online sur appareils.
- Validation historique sur copie représentative de la base cible, avec expertise des commandes ambiguës. Le test d'upgrade de ce lot utilise des fixtures, pas les données réelles.
- Mise en service et surveillance du job de rapprochement ; politique opérationnelle de remboursement/révocation après remboursement **non implémentée automatiquement**.
- Validation commerciale de l'arrondi, de la prise en charge des frais et de la politique de grâce.
- Bloqueurs des phases 2–6 toujours ouverts : ce lot ne corrige pas l'autorisation du contenu, le MFA ou les dépendances.

**Verdict : lot de corrections livré et tests backend verts. R01/R06 restent en cours ; NO-GO production maintenu.**
