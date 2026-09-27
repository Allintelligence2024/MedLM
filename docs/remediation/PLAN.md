# Plan de remédiation MedLM

Date : 2026-09-26. Référence initiale : `228d3d62ee6f1156543e0786fa7cbdf1e42dbc12`.
Branche de travail : `arena/01a0defd-medlm`.

## Décision

**NO-GO pour une ouverture publique avec paiements réels et contenu premium.**
Les tests verts ne lèvent pas les défauts métier reproduits. Ce document est un
plan de travail, pas une attestation de conformité médicale, juridique ou de sécurité.
Aucun déploiement, migration de production ou appel réel à Chargily n'est autorisé
par l'exécution de ce plan seul.

Sources : [contre-analyse et preuves](../reviews/2026-09-26/CONTRE_ANALYSE.md),
rapports Drive décrits dans celle-ci. Le code courant prime sur les rapports sans SHA.
L'ancien plan `PLAN_IMPLEMENTATION.md` et `docs/RELEASE_SCOPE.md` restent historiques ;
les décisions de remédiation sont centralisées ici.

## Périmètre de livraison proposé

Une tranche verticale prouvée : authentification → contenu publié autorisé →
achat/droit premium → téléchargement → révision hors ligne → synchronisation.
Le back-office doit réellement permettre une publication autorisée et traçable.
Les nouveautés IA, ML, partenariats et multi-régions ne sont pas des critères de
succès du MVP. Si leurs routes restent exposées, elles doivent néanmoins respecter
les contrôles de sécurité : « hors périmètre » ne veut pas dire « risque accepté ».

Pas d'ajout de fonctionnalité de croissance avant stabilisation. Pas de
`npm audit fix --force` global. Pas de réécriture des migrations déjà appliquées.
Pas de réintroduction du MFA du batch Drive sans remplacement et tests RFC.

## Phases, ordre et critères d'acceptation

### Phase 0 — Référence, preuves et priorisation

**But : savoir exactement ce qui est testé et ce qui reste inconnu.**

Livrables :
- [x] Plan séquencé, périmètre et décision NO-GO.
- [x] Registre machine-readable des risques, provenance et critères de clôture.
- [x] Runner local reproductible avec SHA, branche, hash des fichiers source et lockfiles.
- [x] Distinction PASS / FAIL / BLOCKED ; contrôle des prérequis plutôt que succès sur skip.
- [x] Conservation des logs, audits npm JSON et des problèmes attendus reproduits.
- [x] Exécution et bilan : voir `PHASE_0.md` et `baseline/`.

**Sortie :** checks de référence exécutés ou explicitement BLOCKED, défauts
reproduits documentés, aucune assimilation entre réussite du diagnostic et correction.
Cette phase ne corrige pas les vulnérabilités. Les étapes Flutter, PostgreSQL 16
serveur, cluster et providers réels restent des critères de phases ultérieures.

### Phase 1 — Paiements et droits premium (R01, R06)

**En cours — corrections locales livrées :** [lot 1](PHASE_1.md), puis [lot 2](PHASE_1_LOT_2.md).
Dernière preuve : 549 tests unitaires, 93 intégration sans skip, dont concurrence
PostgreSQL serveur et upgrade peuplé. Qualification Chargily réelle, Flutter/appareils,
données historiques et mise en service du rapprochement restent bloquantes.
Aucune clôture production déduite des mocks.

1. Écrire des tests de régression métier sur Drizzle + moteur PostgreSQL.
2. Séparer SKU commercial (`monthly/semester/yearly/group`) et droit (`premium`).
3. Persister montant/devise/durée attendus, y compris promotions ; ne pas faire
   confiance à une durée ou identité reçue du webhook.
4. Rapprocher la commande existante ; valider les champs obligatoires du paiement.
5. Crédits atomiques : événements répétés et concurrents ne doivent pas prolonger
   deux fois le même achat. Prendre en compte paiement reçu avant stockage du providerRef.
6. Aligner émission et vérification JWT RS256 ; définir explicitement expiration,
   période de grâce et révocation, sans prétendre à une révocation immédiate hors ligne.

**Sortie :** les quatre plans, promos, refus montant/devise/référence/identité,
rejeu et concurrence sont testés sur vraie exécution SQL ; aucun accès gratuit ni
paiement validé sans droit. Test Chargily sandbox de bout en bout ensuite, avant réel.

### Phase 2 — Autorisations du contenu et workflow (R02, R03)

1. Définir la matrice student/author/medical_reviewer/editor/admin et propriété.
2. Séparer les endpoints de lecture apprenant des lectures éditoriales.
3. Filtrer les brouillons/retirés et vérifier entitlement sur chaque accès premium,
   y compris détail carte, listes, téléchargement, médias et distribution des clés.
4. Autoriser chaque transition par rôle ; définir et faire respecter l'interdiction
   d'auto-approbation, y compris pour les dérogations administrateur auditées.
5. Vérifier le lien réel entre contenu chiffré, clé, appareil et droits ; cesser
   d'affirmer « chiffrement bout en bout » sans parcours démontré.

**Sortie :** tests HTTP + base : étudiant gratuit refusé sur premium et brouillons,
utilisateur premium limité au publié, auteur incapable d'approuver/publier seul,
accès cross-user/cross-tenant refusés selon la politique, audit et versions persistés.

### Phase 3 — Authentification et session admin (R07, R08)

1. Rotation refresh atomique avec tests de concurrence et traitement du rejeu.
2. Politique de cycle de vie des appareils et des jetons expirés.
3. MFA admin : choisir une implémentation éprouvée ; vecteurs RFC 6238,
   secondes/millisecondes, protection du secret au repos, consommation atomique
   des backups et récupération protégée. Ne pas recopier l'implémentation Drive.
4. Tests d'enrôlement/remplacement sans contournement, rate limiting et audit.
5. Session CMS côté serveur via proxy et cookie HttpOnly/Secure/SameSite adapté ;
   traiter CSRF et vérifier les rôles au backend, pas seulement présence du cookie.

**Sortie :** flux de connexion/récupération/admin testés en HTTP ; un seul refresh
concurrent accepté, aucun bypass MFA ; aucune clé/token dans les journaux.

### Phase 4 — Données et infrastructures applicatives (R04, R05, R09)

1. Ajouter des migrations pour les FK réellement manquantes après inventaire
   table/colonne ; détecter les orphelins avant ajout, définir réparation/backfill.
2. Définir effacement/anonymisation et rétention compatibles avec append-only.
   Ne pas activer naïvement des cascades qui cassent les triggers.
3. Connecter Redis avant construction du budget partagé ; cycle de vie/fermeture,
   panne et reconnexion testés. Choisir explicitement fail-open/fail-closed des quotas.
4. Brancher le tracing et prouver réception d'une trace sans données sensibles.
5. Supprimer, documenter ou connecter i18n/CDN/router de réplica inutilisés.

**Sortie :** contrat SQL nominatif (pas seulement un nombre minimal de FK), migrations
sur base neuve et existante, scénario d'effacement testé, budget cohérent sur deux
instances, observabilité exercée et panne Redis documentée.

### Phase 5 — Dépendances, CMS et déploiement (R10, R11, R12)

L'analyse et les mises à jour de dépendances peuvent commencer en parallèle de
phase 1 ; leurs régressions doivent être testées avec les phases précédentes.

1. Trier les advisories par exposition runtime/dev, chemin exploitable et version.
   Mettre à jour par lots réduits avec lockfiles et tests.
2. Corriger transmission de session du catalogue CMS et vrai upload signé.
3. Achever ou retirer de l'interface les pages hors périmètre, sans promesse trompeuse.
4. Monter la clé JWT au chemin attendu ; corriger probes `/v1/*`, variables et droits FS.
5. Tester images/Helm/K8s, migrations, restauration backup, rollback et secrets.

**Sortie :** advisories bloquants corrigés ou analyse documentée acceptée, build et
parcours CMS réels, probes vertes sur déploiement, secrets absents des images/logs,
restauration prouvée. Le résultat d'un checker statique ne suffit pas.

### Phase 6 — Mobile et qualification de livraison (R13, R14)

1. Générer Drift en CI et corriger le README ; builds Flutter reproductibles.
2. Tests appareil : login, achat sandbox, téléchargement, stockage protégé,
   expiration/grâce, révision hors ligne, sync multi-appareil et reprise après panne.
3. Tests concurrence/pagination/perte réseau, contrôle d'accès et restauration.
4. Retirer les affirmations non démontrées (« validation scientifique », partenaires
   réels, sécurité médicale) ; revue humaine du contenu si diffusé.
5. Vérification indépendante des scénarios d'abus et revue de sortie.

**Sortie :** parcours vertical complet avec artefacts, SHA de release, zéro bloqueur
non traité. Décision GO explicite après revue humaine, pas moyenne de notes sur 10.

## Règles d'exécution

Chaque risque suit : ouvert → test échouant avant correction → correctif minimal →
test vert après correction → régression → revue. Les tests caractérisant un bug
attendu (phase 0) ne sont pas des tests d'acceptation : ils doivent être remplacés
par une attente sûre lors de la correction, en conservant les preuves historiques.

Le registre `risks.json` est la liste des risques connus, **pas une preuve d'exhaustivité**.
Les assertions historiques non confirmées ne doivent pas devenir automatiquement
des tickets critiques. Une correction déjà présente n'est pas à refaire.

## Commandes phase 0

```bash
# Prérequis : Node >=22, Python >=3.10, dépendances npm des deux projets.
(cd backend && npm ci)
(cd cms && npm ci)
# PyYAML nécessaire pour ne pas laisser les checkers ignorer leur travail.
python3 -m venv .venv
.venv/bin/pip install PyYAML
.venv/bin/python tools/scripts/remediation_baseline.py
```

Les logs vont par défaut dans `.cache/remediation/phase0/` (non versionné).
`--output DIR` permet une autre destination. Le runner n'installe rien, n'utilise
aucune production et ne modifie ni lockfiles ni schéma déployé. `npm audit` contacte
le registre npm et transmet l'arbre des dépendances. Les builds écrivent leurs
artefacts habituels locaux ignorés par Git.

Un code 0 du runner signifie **référence collectée**, pas produit sécurisé.
Les vulnérabilités npm et les défauts métier attendus restent ouverts même si la
collecte réussit. Un prérequis absent ou une commande en erreur donne un code non nul.

Depuis le lot 1 de remédiation, le runner ne rejoue plus par défaut les assertions
qui exigeaient la présence des anciens bugs. `--include-historical-reproductions`
est réservé au snapshot source de phase 0. Les preuves archivées restent inchangées.
