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

**Implémentation et réception technique validées ; qualification Chargily bloquée.**
Voir la [réception finale](PHASE_1_CLOSURE.md) et la CI verte sur `591cc00`.
549 tests unitaires et 95 tests d'intégration locaux sans skip ; CI PostgreSQL 16,
Flutter analyze/tests/interops RS256/APK, Docker backend et contrat Helm validés.
Le propriétaire confirme l'absence de clients/paiements historiques réels.
R01 et R06 sont fermés pour leurs défauts précis. **La réserve R15 reste ouverte :
aucun accès sandbox ni mise en service du rapprochement qualifiée.** La clôture
complète du paiement réel ne peut donc pas être déclarée. Les tests sur appareils
et le parcours mobile de release complet restent en phase 6.

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

**Critères d'autorisation de la phase 2 couverts.** Voir [PHASE_2.md](PHASE_2.md).
R02 et R03 fermés : lectures apprenant (publié + entitlement), CMS séparé,
workflow par rôle, auto-approbation interdite hors dérogation admin auditée.
Hints, génération d'examen, onboarding, wrap-key et médias suivent la même
frontière. Catalogue global (pas de `tenant_id`). **Pas de chiffrement de
bout en bout** — vérifié : wrap-key n'enveloppe pas le JSON des cartes.
R2 réel, appareil physique et Chargily sandbox restent hors phase 2.

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
accès cross-user refusés selon la politique, audit et versions persistés.

### Phase 3 — Authentification et session admin (R07, R08)

**Implémentation couverte ; voir [PHASE_3.md](PHASE_3.md).** R07 et R08 fermés
pour leurs défauts précis. Session CMS HttpOnly+CSRF (item 5) livrée ; **R11
(R2 / catalogue E2E) reste ouvert en phase 5.** Pas de GO.

1. [x] Rotation refresh atomique avec tests de concurrence et traitement du rejeu.
2. [x] Politique de cycle de vie des appareils et des jetons expirés (max 3, reuse, logout).
3. [x] MFA admin RFC 6238 (HMAC-SHA1, 30 s, AES-GCM, backups atomiques). Pas le batch Drive.
4. [x] Enrôlement sans contournement, rate limiting, audit, remplacement TOTP sans désactiver l'ancien secret.
5. [x] Proxy CMS + cookie HttpOnly/Secure/SameSite + CSRF ; middleware qui interroge `/v1/auth/me`.

**Sortie :** login magic-link / MFA admin HTTP ; un seul refresh concurrent
accepté sur PostgreSQL réel ; pas de bypass MFA ; secrets TOTP absents des
journaux applicatifs. Non-revendications phase 2 inchangées.

### Phase 4 — Données et infrastructures applicatives (R04, R05, R09)

**Implémentation couverte ; voir [PHASE_4.md](PHASE_4.md).** R04, R05, R09
fermés pour leurs défauts précis. CDN / `ReadReplicaRouter` documentés
inutilisés (pas fake-wire). Pas de GO.

1. [x] Migrations FK nominatives après inventaire ; orphelins avant ADD ; backfill NULL/DELETE.
2. [x] Effacement = anonymisation, RESTRICT sur journaux append-only, pas de CASCADE naïf.
3. [x] `connect()` Redis avant DI budget ; fail-open/fail-closed explicite ; `close()` shutdown.
4. [x] Tracing HTTP (`x-trace-id`) + redaction ; i18n magic-link branché.
5. [x] CDN headers et `ReadReplicaRouter` documentés inutilisés (`DRIZZLE_READ` à la place).

**Sortie :** contrat SQL nominatif (pas seulement un nombre minimal de FK), migrations
sur base neuve et existante, scénario d'effacement testé, budget cohérent sur deux
instances, observabilité exercée et panne Redis documentée.

### Phase 5 — Dépendances, CMS et déploiement (R10, R11, R12)

**R10 fermé** (triage + exclusions documentées). **R11 in_progress** (presign
code + catalogue cookie ; pas de R2 live). **R12 in_progress** (manifests
`/v1/*` + JWT fichier ; pas de cluster). Voir [PHASE_5.md](PHASE_5.md) et
[advisories.md](advisories.md). Pas de GO.

1. [x] Trier les advisories ; lots réduits (`nanoid` 3.3.18, pins Next/TipTap).
   Pas de `npm audit fix --force`. Nest 12 / Next 15 / drizzle 0.45 exclus.
2. [x] Session CMS (phase 3) + catalogue cookie + presign SigV4 si `R2_*`.
   [ ] Upload R2 réel / E2E navigateur — manuel.
3. [x] Pages hors MVP sorties de la nav primaire, bannière honnête.
4. [x] JWT fichier + probes `/v1/*` (manifests `7188eca` + garde statique).
5. [ ] Cluster, restore backup, rollback, secrets live — manuel.

**Sortie partielle :** analyse npm écrite, CMS sans promesse R2/partenariat,
probes dans les manifests. Restauration et probes **sur déploiement** absentes.

### Phase 6 — Mobile et qualification de livraison (R13, R14)

**R14 fermé** (promesses retirées, pas « validées »). **R13 in_progress**
(CI Drift + README). Voir [PHASE_6.md](PHASE_6.md). **NO-GO.**

1. [x] Drift généré en CI ; README aligné (pas de `*.g.dart` commité, un
   seul workflow `.github/workflows/backend-ci.yml`).
2. [ ] Tests appareil — manuel.
3. [ ] Concurrence/pagination/perte réseau sur appareil — manuel.
4. [x] Reformulation README / `site/` / `store/`. [ ] Revue humaine du
   contenu pédagogique si diffusion.
5. [ ] Revue d'abus indépendante et GO.

**Sortie :** pas de GO. SHA de release store absent. Bloqueurs manuels
restants listés, pas niés.

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
