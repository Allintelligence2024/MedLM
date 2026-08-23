# Périmètre de livraison — tranche verticale MVP

> **Statut : gelé le 23 août 2026**
>
> Ce document est la référence opérationnelle pour avancer sur le dépôt.
> Les rapports de phases historiques décrivent des intentions ou des lots
> précédents ; ils ne constituent pas une preuve de disponibilité produit.

## 1. Décision

Nous cessons d'ajouter des fonctionnalités horizontales. Le prochain objectif
n'est pas une nouvelle phase IA, gamification ou partenariats : c'est une
**tranche verticale démontrable sur infrastructure réelle**.

Le produit ne sera considéré comme lançable que si le parcours suivant
fonctionne depuis un clone neuf et laisse des preuves reproductibles :

```text
installation
  → migration PostgreSQL
  → seed déterministe
  → authentification
  → catalogue de contenu publié
  → téléchargement local réel
  → étude hors ligne
  → push/pull SRS depuis deux appareils
  → contrôle free/premium côté serveur
  → vérification CI/E2E
```

## 2. Dans le périmètre de la tranche verticale

### Plateforme et preuve

- Node, PostgreSQL, Redis, Flutter/Dart et Playwright disponibles dans la CI ;
- workflows GitHub réellement placés dans `.github/workflows/` ;
- démarrage local reproductible ;
- migrations exécutables sur base vide et base existante ;
- seed PostgreSQL versionné, idempotent et utilisé par les E2E ;
- aucune validation ne devient verte uniquement parce qu'un SDK ou un service
  est absent.

### Backend

- authentification avec un flux réellement vérifiable ;
- JWT et refresh tokens avec rotation, expiration et révocation testées ;
- PostgreSQL comme source réelle pour le contenu et le SRS ;
- migrations alignées avec le schéma Drizzle, y compris les contraintes ;
- API étudiante limitée aux cartes publiées et autorisées ;
- entitlement premium vérifié côté serveur ;
- journal de révision append-only et fold SRS déterministe ;
- push/pull idempotent, paginé et sûr en multi-appareil ;
- assertions métier sur `accepted`, `rejected`, les curseurs et l'état final.

### Contenu et CMS minimal

- un programme, un module, un deck gratuit et un deck premium seedés ;
- cartes basic et QCM valides dans un contrat unique backend/CMS/mobile ;
- lecture étudiante de contenu publié uniquement ;
- édition et transitions CMS protégées par rôle ;
- snapshots de versions et audit des transitions ;
- signalement de carte fonctionnel ;
- pas de prétention à un upload média réel tant que R2 n'est pas réellement
  configuré et testé.

### Mobile

- plateforme **Android uniquement** pour le MVP ; iOS est explicitement différé
  après validation du product-market fit et ne bloque pas cette tranche ;
- code Drift généré et cohérent ;
- application compilable et lançable ;
- téléchargement qui écrit effectivement les cartes dans la base locale ;
- étude hors ligne avec au moins une carte réelle ;
- outbox SRS et curseur de pull persistés transactionnellement ;
- reprise après redémarrage et synchronisation de deux appareils testées.

### Premium

Le périmètre inclut le **contrôle d'accès free/premium**. Le premier test
peut utiliser un entitlement seedé ; le paiement Chargily en production ne
sera déclaré prêt qu'après un test sandbox réel, une vérification de signature
et un test de rejeu de webhook.

## 3. Explicitement hors périmètre du MVP

Ces sujets peuvent rester dans le dépôt, mais ne doivent ni bloquer ni être
présentés comme des preuves de livraison :

- génération de cartes par LLM et fournisseur IA réel ;
- voice-to-card, tuteur conversationnel et dictée ;
- prédiction ML et apprentissage adaptatif avancé ;
- gamification complète, badges et leaderboard ;
- examens blancs et anti-triche avancés ;
- partenariats facultés ;
- packs de groupe et multi-tenants complets ;
- multi-régions, réplicas de lecture et optimisation de scale ;
- partage social et intégrations externes ;
- GraphQL supplémentaire si le parcours REST suffit ;
- notifications push avancées ;
- publication iOS ;
- publication store et paiement live tant que la tranche locale n'est pas
  prouvée.

Une fonctionnalité hors périmètre peut être conservée dans le code, mais elle
sera marquée **expérimentale / non release-gate** et ne doit pas être utilisée
pour gonfler le statut d'avancement.

## 4. État de départ — faits connus

Les points suivants sont des bloqueurs constatés dans le dépôt au moment du
gel :

- `mobile/lib/data/local/app_database.g.dart` est absent ;
- les plateformes Android/iOS sont absentes ;
- `RestSyncRepository` référence `_db` alors que seul `db` existe ;
- le service de synchronisation en arrière-plan appelle le repository avec des
  signatures incompatibles ;
- le curseur mobile est toujours appelé avec `sinceMs: 0` ;
- le téléchargement mobile enregistre seulement des métadonnées et ne remplit
  pas les cartes locales ;
- aucun seed PostgreSQL déterministe n'a été trouvé ;
- les tests HTTP dits d'intégration remplacent `DRIZZLE` par des fakes ;
- Playwright n'est pas disponible dans l'environnement courant ;
- les workflows sont dans `ci/workflows/`, pas dans `.github/workflows/` ;
- `npm run lint` du CMS est interactif ;
- le backend ne filtre pas encore correctement statut publié, premium et rôle
  sur les lectures de contenu ;
- plusieurs contrats de contenu backend/CMS/mobile ne correspondent pas ;
- les examens contiennent encore une logique de génération et de scoring
  insuffisante pour une livraison.

Ce document ne transforme aucun de ces points en tâche terminée. Chaque point
reste ouvert jusqu'à preuve par une commande ou un test reproductible.

## 5. Ordre obligatoire des travaux

1. **Preuve et infrastructure** : CI active, outils disponibles, démarrage
   reproductible.
2. **Compilation mobile** : plateformes, génération Drift, analyse et build.
3. **Schéma et données** : migrations PostgreSQL réelles, contraintes et seed.
4. **Contrat contenu** : format unique et téléchargement local réel.
5. **Auth, RBAC et premium** : contrôle serveur et tests négatifs.
6. **Synchronisation SRS** : curseur transactionnel, multi-appareil,
   PostgreSQL réel.
7. **Parcours vertical** : E2E complet sur clone neuf.
8. **Seulement après** : réévaluer examens, IA, gamification et autres lots.

Toute nouvelle tâche doit pointer vers une étape ci-dessus. Si elle ne le
fait pas, elle est reportée.

## 6. Definition of Done

La tranche est acceptée uniquement si les affirmations suivantes sont
exécutables et vertes :

- une base PostgreSQL vide est migrée sans intervention manuelle cachée ;
- le seed crée les utilisateurs, rôles, decks et cartes attendus ;
- un étudiant voit le deck gratuit publié ;
- il ne voit ni carte brouillon ni contenu premium non autorisé ;
- un entitlement autorise le premium et son expiration le retire ;
- le mobile télécharge une carte et la révise en mode avion ;
- une revue est poussée, acceptée et reconstruite côté serveur ;
- un second appareil récupère l'événement sans doublon ;
- le curseur reste correct après fermeture et redémarrage ;
- un author ne peut pas publier ; un reviewer/editor peut effectuer uniquement
  les transitions prévues ;
- un token magic link ou équivalent ne peut pas être rejoué ;
- un refresh token révoqué est refusé ;
- les E2E ne sautent pas silencieusement faute de seed ;
- la CI exécute réellement ces contrôles sur chaque pull request.

## 7. Règle de communication

Les rapports doivent employer trois statuts distincts :

- **Implémenté et prouvé** : code + test exécutable sur l'infrastructure
  concernée ;
- **Implémenté mais non prouvé** : code présent, validation manquante ;
- **Partiel / documentaire** : squelette, stub, mock ou intention de design.

Un build TypeScript réussi, un test avec fake DB ou la présence d'une page UI
ne suffit pas à utiliser le premier statut.
