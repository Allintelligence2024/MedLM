# Contre-analyse des rapports MedLM

**Date : 26 septembre 2026.**  
**Version réellement testée : `228d3d62ee6f1156543e0786fa7cbdf1e42dbc12`.**  
**Objet : vérifier les rapports, pas modifier l'application.**

## Verdict franc

**Ces rapports contiennent des observations utiles, mais ne sont pas un audit de sécurité suffisamment fiable pour décider seuls d'une mise en production.** Ils mélangent des faits exacts, une autre version du code, des conclusions excessives et des erreurs techniques démontrables. Leur ton très élogieux et leurs notes sur 10 ne sont pas justifiés par une méthode de notation reproductible.

Deux erreurs seraient particulièrement dommageables :

1. Les prendre pour argent comptant et corriger une « absence de commande de paiement » qui n'existe pas dans le checkout actuel.
2. Les rejeter entièrement et ignorer les vrais problèmes : Redis non connecté, contrôle d'accès au contenu insuffisant, incohérences SQL, workflow éditorial insuffisamment autorisé et dépendances vulnérables.

**Je ne validerais pas une ouverture publique avec paiements réels et contenu médical premium sur la base des preuves actuelles.** Ce n'est pas parce que « cinq critiques » ont été annoncées : j'ai reproduit des problèmes plus concrets que certaines de ces critiques.

---

## 1. Périmètre et limites : ce qui a réellement été lu et testé

### Documents

Le [dossier Drive fourni](https://drive.google.com/drive/folders/13pMvWOIZjdwERUcSlv9A2PTj-YB5_dfu) expose **21 fichiers** : 14 rapports Markdown et 7 batches de code. `MISSION.md`, `inventory.json` et `parts.json`, annoncés auparavant, ne figurent pas dans cette liste.

- Les **13 rapports autonomes** P1–P10, FINAL, FINAL_passe1 et passe2 ont été lus intégralement via leurs liens de téléchargement web, y compris leurs fragments suivants.
- `RAPPORT_COMPLET.md` a été identifié par son introduction, son sommaire et son début comme une compilation de ces rapports. **Je n'ai pas relu intégralement les 20 fragments de cette compilation pour prouver une identité octet par octet.** Son verdict ci-dessous porte sur la méthode annoncée et les conclusions des rapports constitutifs.
- Les sept `batch_*.txt` ont été **consultés de manière ciblée**, pas intégralement. En particulier, le billing de `batch_P6.txt` et le MFA de `batch_P3.txt` ont été examinés pour départager version différente et affirmation erronée.
- Le téléchargement direct Drive par `curl` a échoué sur la connexion TLS. La lecture web a réussi. **Les originaux Drive ne sont donc pas archivés ici sous forme de téléchargements bruts complets.** Les fichiers du dossier `evidence/` sont mes résultats de vérification, pas des copies des rapports d'origine.

### Code et exécution

J'ai installé les dépendances verrouillées, exécuté les tests/builds ci-dessous, lu les services et migrations concernés et ajouté un script de reproduction indépendant, sans modifier leur logique.

| Vérification | Résultat observé |
|---|---|
| Backend `npm run typecheck` | Réussi |
| Backend `npm run lint` | Réussi |
| Backend `npm test` | **533 tests, 38 fichiers, tous réussis** |
| Backend `npm run test:integration` | **52 tests, 6 fichiers, tous réussis** |
| Backend `npm run build` | Réussi |
| CMS `npm ci` puis `npm run build` | Réussi ; journal des routes conservé |
| Backend `npm audit --json` | **53 entrées vulnérables : 1 critique, 11 hautes, 37 modérées, 4 faibles** |
| Backend `npm audit --omit=dev --json` | **31 entrées : 0 critique, 5 hautes, 25 modérées, 1 faible** |
| CMS `npm audit --json` | **29 entrées : 1 critique, 2 hautes, 26 modérées** |
| `check_workflows.py`, avec PyYAML installé | Réussi, **1 workflow actif** analysé |
| `check_dart_static.py` | Réussi avec avertissement : `app_database.g.dart` absent |
| `check_migrations_apply.py` | Réussi : **39 tables déclarées**, 22 fichiers ; analyse statique seulement |
| `validate_content.py` | 693 cartes, 9 decks, 15 cas invalides ; validation structurelle |
| `check_mobile_i18n.py` | **213 clés × 3 langues**, et non 178 dans cette version |
| `dart_parity_check.py` | Réussi ; comparaison structurelle, pas exécution Dart |
| `ml_eval.py` | MAE 2,93 sur **4 000 sujets synthétiques** |
| Gardes sécurité, régions, Dockerfiles, lockfiles | Réussis dans le périmètre de leurs vérifications |

**Limites importantes :** pas de SDK Flutter/Dart, de cluster Kubernetes, de Docker ni de serveur PostgreSQL 16 disponible pour un déploiement réel. Le contrat SQL et mes reproductions utilisent **PGlite, moteur PostgreSQL embarqué en WASM**, avec retrait de la seule instruction d'installation `pgcrypto`, comme le fait le test existant. Les autres tests d'intégration HTTP utilisent des substitutions de base : ils ne constituent pas tous des parcours contre PostgreSQL réel. Aucun appel réel à Chargily ni essai sur une production.

La première exécution de la garde workflows a été ignorée faute de PyYAML, malgré un code de sortie 0. J'ai installé PyYAML dans un environnement séparé puis relancé : le succès final est une vraie exécution du checker. Cela illustre justement pourquoi un code de sortie vert ne suffit pas.

Les journaux sont dans [`evidence/`](evidence/). Le script [`reproduce.cjs`](evidence/reproduce.cjs) s'exécute après `cd backend && npm ci && npm run build`, puis, depuis la racine, `node docs/reviews/2026-09-26/evidence/reproduce.cjs`.

---

## 2. Le problème préalable : les versions ne correspondent pas

Les rapports ne donnent pas de SHA Git immuable. Ils citent un checkout Windows et des fichiers locaux. Les batches permettent de démontrer que ce n'est pas exactement la version présente ici.

| Élément | Documents/batches fournis | Checkout testé |
|---|---|---|
| `BillingService.createCheckout` | Aucun INSERT dans `payment_orders` | INSERT avant appel provider, puis stockage de `providerRef` |
| Attribution webhook | `payload.metadata.user_id` | `order.userId`, lu en base |
| MFA | Services, contrôleur, tests et migration présents | Fichiers MFA absents ; migration 0020 consacrée au RBAC |
| Tests unitaires | 549 / 40 fichiers | 533 / 38 fichiers |
| Tests d'intégration | 7 fichiers décrits | 6 fichiers, dont contrat PGlite |
| i18n mobile | 178 clés | 213 clés |
| CI active | Deux workflows décrits dans P1 | Un workflow regroupant plusieurs jobs |

**Conséquence : « faux sur la version actuelle » ne veut pas automatiquement dire « inventé dans le rapport ».** L'absence de commande préenregistrée est bien visible dans le batch fourni. Je ne peux pas établir ici l'ordre chronologique exact entre cette copie locale et le checkout, ni leur correspondance avec un commit absent des rapports.

À l'inverse, certaines affirmations sont fausses **même en comparant le rapport au batch qui l'accompagne**, notamment la conformité TOTP et le stockage du secret MFA.

---

## 3. Avis rapport par rapport

### P1 — Racine, documentation et CI

**Verdict : partiellement vrai ; diagnostic CI insuffisant, contradiction du README réelle.**

- **Confirmé :** aucun `.g.dart` versionné trouvé ; `README.md:153–158` donne une commande de génération mais affirme ensuite que le généré est commité.
- **À nuancer :** cela impose une étape de génération, ce n'est pas une preuve que le mobile ne peut pas être compilé. Le workflow actuel exécute `build_runner`.
- **Non confirmé aujourd'hui :** « CI cassée à cause du script introuvable ». Le checker passe ici ; la première conclusion avait déjà été retirée en passe 2.
- **Vrai problème résiduel du checker :** `tools/scripts/check_workflows.py:125–130` résout encore certains scripts depuis la racine. Le défaut logique peut exister sans être déclenché par les workflows actuels.
- « Documentation exceptionnelle » et « chaque invariant critique a sa preuve » sont des appréciations, pas des résultats d'audit. Plusieurs contre-exemples ci-dessous invalident la seconde généralisation.

**À garder :** corriger le README et réduire la divergence documentaire. **À écarter :** la conclusion automatique qu'aucun test ne tourne en CI.

### P2 — Infrastructure backend

**Verdict : un des rapports les plus utiles, mais plusieurs erreurs factuelles et inférences excessives.**

**Confirmé dans le checkout :**

- `cache/cache.module.ts:13–18` instancie `RedisCache` sans appeler `connect()`. Le constructeur ne connecte rien (`redis-cache.ts:53–69`). `gateway.module.ts` choisit alors le budget mémoire au démarrage.
- Pas d'appel applicatif trouvé branchant `TracingService.middleware()`, ni de consommation du catalogue `I18n` ou du helper CDN hors de leur infrastructure/tests.
- Pas d'alimentation applicative trouvée de `ReadReplicaRouter.updateHealth()`.
- **46 déclarations `references()` en schéma contre 31 FK réellement créées**, confirmé ici par interrogation du catalogue PGlite, pas seulement par grep. Les tables critiques mentionnées comme `review_logs`, `refresh_tokens`, `entitlements` et `user_devices` sont absentes de la liste des tables dotées de FK.
- Le message `migrations OK` se trouve bien dans un `finally` et peut être imprimé après un échec.

**Faux, trompeur ou non démontré :**

- **Clé privée « committée » : non prouvé.** `git ls-files backend/keys` est vide dans le checkout ; le rapport final corrige P2. Un fichier local ignoré n'est pas une fuite Git. Cela n'est pas pour autant un audit de tout l'historique et de tous les canaux de fuite.
- **« ts-fsrs jamais importé dans le repo » : faux.** `tools/verify_against_ts_fsrs.js:14` et `tools/verify_sequences_ts.js:14` le chargent. Il n'est pas le moteur directement importé par les services backend : cette formulation plus étroite serait juste.
- **« Chiffrement RSA-OAEP = forward secrecy » : faux raccourci.** Ne pas conserver la clé AES en clair ne suffit pas à garantir la confidentialité persistante face à une compromission ultérieure de la clé privée RSA du destinataire.
- L'absence de cascade SQL est un vrai risque d'intégrité/effacement ; elle ne suffit pas, seule, à rendre un verdict juridique de non-conformité RGPD.
- Une panne intermédiaire du runner ne permet normalement pas de valider les migrations suivantes : la boucle est dans une transaction avec rollback. Un historique préalablement incohérent est un autre scénario.
- Un ETag n'est pas un mécanisme d'authentification. Ses collisions méritent une analyse fonctionnelle, pas une assimilation automatique à une faille cryptographique.
- Des compteurs Prometheus qui repartent à zéro au redémarrage ne sont pas anormaux en soi ; il faut analyser les requêtes et le stockage de supervision avant de conclure à un SLO inutilisable.

### P3 — Authentification, MFA, OAuth et RBAC

**Verdict : fiabilité insuffisante sur la sécurité MFA. Plusieurs assertions centrales sont fausses dans le batch fourni.**

**Ce qui est juste :** le fail-fast de configuration JWT en production existe ; les refresh révoqués/expirés sont filtrés ; le commentaire `X-Impersonate-User` ne correspond pas à une implémentation trouvée ; `issueTokens` ajoute une ligne `user_devices` à chaque émission.

**MFA : distinction indispensable entre versions.** Les fichiers cités ne sont pas dans le checkout courant, mais ils figurent dans [batch_P3.txt](https://drive.google.com/file/d/1eMUn4Mwv2tUBIVhe12evq2T69Vs4GyyS/view). L'analyse suivante porte sur cette copie :

1. **« HMAC-SHA1, RFC 6238 respectée » : faux.** `computeTOTP` et `verifyTOTP` font `createHash('sha1').update(secret).update(counterBuf)`. C'est SHA-1(secret || compteur), **pas HMAC-SHA1**.
2. **Temps faux :** `Math.floor(nowMs / TOTP_PERIOD)` avec `TOTP_PERIOD = 30` et `nowMs = Date.now()` utilise des pas de 30 millisecondes, pas 30 secondes.
3. Contrôle indépendant, en retranscrivant ces opérations : à 59 secondes, avec le secret ASCII standard `12345678901234567890`, la version correcte à 6 chiffres donne **287082**, l'algorithme du batch donne **119679**. Référence : [RFC 6238, sections 3–4 et appendice B](https://www.rfc-editor.org/rfc/rfc6238).
4. **« Secret TOTP hashé, jamais en clair » : faux.** `setup()` écrit `mfaSecret: secret`. Les backup codes sont hashés ; le secret TOTP ne l'est pas. Un vérificateur TOTP doit pouvoir utiliser le secret, typiquement conservé chiffré au repos avec protection de clé, pas simplement hashé de manière irréversible.
5. **Backup codes 12 caractères rejetés par disable/regenerate : vrai dans le batch.** Les deux routes utilisent `EnableBody`, limité à 6 caractères.
6. **« Bloqué définitivement hors du compte » : excessif.** `/verify` accepte jusqu'à 20 caractères et peut accepter un backup code. Le parcours de récupération/désactivation est défectueux, mais l'impossibilité absolue de toute connexion n'est pas démontrée par ce seul schéma.
7. **Consommation concurrente des backup codes non garantie dans ce batch :** lecture de la liste puis UPDATE sans condition CAS sur l'ancienne valeur. Deux appels peuvent observer le même code avant retrait.

**Autres réserves :** le lien envoyé par email contient bien `?token=...` : « jamais en query string » est faux si l'on parle du flux entier. Le POST de vérification peut, lui, utiliser un body. Dans le checkout actuel, la rotation refresh est un SELECT puis un UPDATE non conditionné à `revoked_at IS NULL` (`auth.service.ts:79–102`) ; je ne valide donc pas l'affirmation « consommation atomique partout / rejeu impossible ». La concurrence doit être testée spécifiquement.

**Conclusion :** qualifier ce MFA de « correct RFC 6238 » après lecture intégrale est une erreur majeure d'audit, pas une nuance de notation.

### P4 — IA, hints, tuteur et génération

**Verdict : description technique largement plausible, assurance de sécurité médicale excessive.**

- Les hints par règles, providers mock/HTTP, disclaimers, heuristiques d'urgence, génération en brouillon et bornes des ajustements sont de vrais mécanismes.
- **Un disclaimer ne prouve ni l'exactitude médicale, ni l'efficacité de la détection d'urgence, ni la résistance aux réponses dangereuses.** Dire que le risque est « contenu » parce que le système répond avec disclaimer n'est pas une évaluation clinique.
- Les seuils d'ajustement FSRS sont des heuristiques bornées, pas une validation scientifique de leur effet sur l'apprentissage.
- **« Validation humaine obligatoire » n'est pas suffisamment imposée par le workflow actuel.** Un même auteur peut faire approuver puis publier une carte via les routes existantes ; reproduction en section 4.
- Un code `status='draft'` à la génération ne suffit pas non plus si les endpoints de lecture retournent des brouillons aux étudiants.

**À garder :** les mécanismes et la séparation des providers. **À retirer :** « le plus abouti » et « sécurité médicale non négociable » utilisés comme certificats de sûreté.

### P5 — Domaine métier, contenu, examens, SRS, chiffrement et ML

**Verdict : trop optimiste ; des contrôles de bout en bout manquent.**

- Le timer serveur des examens, le masquage des réponses correctes et le fold SRS sont des mécanismes réels et des tests les couvrent.
- **Fold déterministe ≠ synchronisation sans perte prouvée.** Il faut aussi vérifier concurrence, pagination, horloges, autorisations et atomicité des écritures.
- **RSA-OAEP + AES ne suffisent pas à prouver un chiffrement de bout en bout du contenu distribué.** Le service de clés génère une nouvelle clé, mais les routes de contenu inspectées renvoient le contenu JSON en clair au client authentifié, sans entitlement.
- **« Cache Redis + invalidation à publication » n'est pas confirmé dans `ContentService` actuel**, qui n'injecte pas RedisCache. La connexion Redis est de toute manière inactive.
- La MAE **2,93 est reproductible**, mais `tools/ml_eval.py:1–19` explique que les données sont synthétiques et générées avec une fonction proche du modèle. Ce n'est pas une validation sur les résultats d'étudiants réels. Le code applique une sigmoïde à une combinaison de features ; « régression linéaire » est une description incomplète.
- Les 693 cartes passent un validateur de structure/politique. **Leur validité médicale n'est pas prouvée.**
- Une allow-list de dix facultés ne prouve pas dix partenariats signés ; des régions déclarées ne prouvent pas une isolation multi-tenant.

**Omissions majeures :** exposition des brouillons/premium et séparation insuffisante des rôles éditoriaux.

### P6 — Billing, notifications et gateway

**Verdict : défaut d'architecture réel dans le batch, non applicable tel quel au checkout ; criticité « exploitation arbitraire » suraffirmée.**

- Dans **batch_P6**, `createCheckout` n'enregistre effectivement pas de commande. Le webhook crée la première ligne puis crédite à partir des métadonnées. **Ce constat n'est pas inventé.**
- Dans le **checkout testé**, `billing.service.ts:61–89` crée la commande avant le provider et `:128–145` retrouve son propriétaire. La correction demandée est donc déjà présente dans cette version.
- Même pour le batch, le rapport ne démontre pas qu'un utilisateur normal peut altérer des métadonnées **signées par un provider fiable**. Son scénario suppose le vol du secret HMAC. Cela justifie de renforcer le rapprochement, pas d'affirmer sans qualification un contournement critique ouvert à tous.
- Le caractère public d'un endpoint webhook n'est pas en soi une faille ; sa signature et ses contrôles métier sont sa frontière de confiance.
- `user_id = 'unknown'` n'est pas seulement une « donnée fausse » dans une colonne UUID avec FK : l'insertion est susceptible d'être rejetée.
- Les opérations GraphQL persistées sont réelles ; **le budget Redis réellement partagé n'est pas actif** sans connexion Redis préalable. P6 valorise une garantie que P2 invalide dans le câblage global.
- Je n'ai pas testé APNs/FCM en conditions réelles : « notifications complètes » reste non démontré.

**Problème actuel plus concret :** un paiement mensuel confirmé atteint une écriture `plan='monthly'` dans une table n'acceptant que `free/premium`. Reproduit avec le vrai service et les migrations, voir section 4.

### P7 — Tests et CI

**Verdict : observations intéressantes sur les limites des tests, mais inventaire non applicable au checkout et plusieurs conclusions trompeuses.**

- Le checkout a **533 tests unitaires et 52 d'intégration**, pas 549 unitaires et les sept fichiers décrits. Je ne peux pas confirmer ou infirmer l'exécution historique des 549 sur le poste Windows.
- Le `expect(true).toBe(true)` de `leaderboard.test.ts:108` et le test vide `metrics.test.ts:26` existent. Dire ailleurs « zéro test décoratif » contredit ces exemples.
- Les tests miroir et le test RSA qui n'exerce pas `DeckKeysService` sont de vraies limites.
- **Absence d'import direct ≠ absence de couverture.** Un test qui importe `AppModule` importe indirectement contrôleurs et services. Le décompte 111/178 n'est pas une mesure de couverture instrumentée.
- La contradiction alléguée des tests MFA ne peut pas être revérifiée dans le checkout : ces tests y sont absents, et les batches consultés ne fournissent pas leur contenu. **Non vérifié**, pas « confirmé ».
- Retourner le secret/URI TOTP au titulaire lors de l'enrôlement est nécessaire pour configurer son authentificateur. Ce n'est pas automatiquement une fuite de sécurité ; il faut juger l'autorisation, le transport, la journalisation et la possibilité de réenrôlement.
- `test:all` correspond bien à `vitest run` et ne lance pas la config d'intégration séparée.

Les tests qui passent sont une preuve utile des cas testés. Mes reproductions montrent pourquoi ils ne constituent pas un certificat du produit entier.

### P8 — Mobile Flutter

**Verdict : base technique crédible, mais preuve d'exécution largement surinterprétée.**

- Absence du généré Drift confirmée ; contradiction du README confirmée.
- **`dart_parity_check.py` n'exécute pas Dart.** Son propre en-tête explique qu'il extrait/normalise des expressions et ne remplace pas `dart test`. « Parité prouvée par exécution Dart↔TS↔Python » est donc trompeur lorsqu'il s'appuie sur ce script.
- Les tests backend de parité ont passé ici ; cela ne remplace pas un build/appareil mobile ni les tests Flutter non exécutés dans cet environnement.
- Le contrôle i18n constate 213 clés dans cette version et cible notamment `lib/ui/` ; « zéro chaîne en dur dans toute l'application » dépasse son périmètre.
- La crypto locale et les contraintes de synchronisation en arrière-plan ne prouvent pas que téléchargement, vérification de droits, déchiffrement et reprise hors ligne sont tous branchés et fonctionnels.
- La fusion avec tri n'est pas généralement O(n) : le tri est habituellement O(n log n).

**Je ne valide pas « seul vrai bloquant : le généré ».** Il faut une preuve Flutter complète, avec plateformes natives générées/configurées et un parcours appareil réel.

### P9 — CMS Next.js

**Verdict : build et vulnérabilités confirmés ; sécurité et caractère fonctionnel surestimés.**

- J'ai refait le build : il réussit. Les pages utilisateurs/examens sont bien des squelettes.
- Les **29 entrées npm audit** sont reproduites. Mais **Tiptap est classé modéré** dans cette réponse d'audit ; les deux entrées hautes sont **nanoid et postcss**. La liste détaillée du rapport est donc inexacte pour l'audit observé.
- `cms/src/middleware.ts` vérifie **la présence** du cookie, pas sa validité. Une valeur arbitraire suffit à passer ce filtre de rendu. Le backend doit toujours protéger les données.
- **Un middleware ne compense pas un cookie non-HttpOnly contre le vol par JavaScript/XSS.** Ce sont deux problèmes distincts.
- Omission : `app/admin/cards/page.tsx` est un composant serveur appelant `apiFetch`, mais `authHeaders()` lit `document.cookie` et retourne un jeton vide côté serveur (`auth.ts:32–37`). La session navigateur n'est pas automatiquement transmise au backend. Le build statique réussi ne prouve donc pas un catalogue CMS authentifié fonctionnel.
- Autre omission : `ContentService.presignMedia` renvoie une URL `r2.example.com` avec `X-Amz-Stub=1` (`:334–352`). **L'upload R2 n'est pas un flux réel terminé.**

**Ne pas exécuter aveuglément `npm audit fix --force`.** Choisir les versions corrigées, distinguer dev/prod et applicabilité des avis, migrer puis tester. La commande peut introduire des changements majeurs sans prouver la résolution du parcours produit.

### P10 — Déploiement, outils et rapports historiques

**Verdict : présence des manifests et outils confirmée ; « infrastructure mature » non démontré.**

- Non-root, système de fichiers en lecture seule et limites de ressources sont bien présents.
- Des templates de secrets ne prouvent ni un Vault opérationnel ni une intégration ESO installée.
- Un dashboard portant « P95 < 500 ms » est un **objectif**, pas une mesure que le service respecte.
- `check_migrations_apply.py` **n'applique pas les migrations à une base** : il compare les noms et recherche des instructions. Son en-tête le dit explicitement. J'ai effectué séparément une exécution SQL PGlite.
- **Incohérences omises :** le déploiement K8s de base sonde `/readyz` et `/healthz`, alors que `configure-app.ts:41–43` applique `/v1` aux routes health. Il injecte `JWT_SIGNING_KEY`, tandis que le bootstrap attend `JWT_SIGNING_KEY_PATH`. Le template Helm utilise également le nom sans `_PATH` et les values conservent les probes sans préfixe.
- Une personnalisation de déploiement pourrait corriger ces écarts ; **les manifests tels qu'inspectés ne constituent pas une preuve de démarrage production réussi.** Aucun cluster n'a été lancé ici.
- Le rapport annonce 26 scripts exécutés mais présente une vingtaine de lignes et des comptes « 20 passent, 1 échoue » sans réconciliation. Il ne joint pas tous les journaux permettant de reproduire son total.

### RAPPORT_FINAL_passe1.md

**Verdict : document historique, à ne pas utiliser comme plan de correction actuel.**

- Sa conclusion « CI cassée, aucune preuve exécutée en push » est explicitement retirée par l'auteur ensuite.
- Son constat billing correspond au batch, pas au checkout.
- Les nombres 53/29 vulnérabilités sont reproductibles, mais **Next.js n'est pas dans l'audit backend**. La critique backend observée concerne **Vitest**, une dépendance de développement.
- Les expressions « FSRS scientifiquement validé », « sécurité médicale non négociable » et « infrastructure mature » dépassent les preuves.
- « 10 facultés partenaires » confond configuration produit et réalité contractuelle.

### RAPPORT_passe2.md

**Verdict : corrige utilement des erreurs, mais ajoute une nouvelle “critique” mal démontrée.**

- Correction de la confusion CI : raisonnable.
- Correction de la confusion clé privée locale/committée : raisonnable.
- **Branche HS256 d'`EntitlementService.verify()` : réelle.**
- **« Même faille critique que l'ancien secret HS256 public » : non démontré.** En production, `AuthModule` utilise toujours `buildJwtConfig`, même si `EntitlementService` ne l'appelle pas directement. L'absence de clé privée empêche le démarrage. Avec la config de production RS256 et sans clé publique explicite, ma reproduction rejette tant le jeton RS256 émis que le HS256 forgé avec `secret or public key must be provided`.
- C'est donc **un défaut de configuration/vérification reproduit**, pas une acceptation démontrée de jetons arbitraires en production. Un scénario supposant déjà une exécution de code ou un vol de clés doit être identifié comme tel.
- Aucun appel applicatif courant à `EntitlementService.verify()` n'a été trouvé ; le contrôleur appelle `issue()` et le mobile a son propre vérificateur. **« Panne totale du paywall » ne suit pas automatiquement de l'échec de cette méthode.**
- Le rapport écrit aussi que `verify()` accepte « RS256 + HS256 », alors que l'expression citée choisit **l'un ou l'autre**.

### RAPPORT_FINAL.md

**Verdict : meilleure synthèse que passe1, mais pas fiable comme liste priorisée des risques.**

Il retire deux erreurs, mais maintient la confusion de versions sur le paiement, l'exploitation HS256 non démontrée, la confusion Next/backend et des assurances excessives sur MFA, chiffrement et validation scientifique. Il classe des pages admin inachevées avec des vulnérabilités « critiques », sans modèle de criticité cohérent.

La note **7,5/10** n'est pas exploitable pour une décision : pondérations, seuils et périmètre ne sont pas définis. Une absence de contrôle d'accès ne se compense pas par une excellente documentation.

### RAPPORT_COMPLET.md

**Verdict : compilation utile à la traçabilité, pas preuve indépendante supplémentaire.**

Son introduction promet une analyse « fichier par fichier, ligne par ligne », mais P4/P6 déclarent des lectures partielles et P10 une lecture collective des rapports historiques. **L'exhaustivité annoncée dépasse donc celle admise dans ses constituants.**

La compilation conserve des conclusions retirées et des versions de notes différentes. Elle doit signaler clairement ce qui est historique et porter un SHA de référence. La répétition d'une affirmation entre P6, passe1, passe2 et FINAL ne constitue pas quatre confirmations indépendantes.

---

## 4. Problèmes concrets manqués ou minimisés

### A. Abonnement payé : écriture refusée par le schéma — reproduit

**Priorité : bloqueur du parcours de paiement réel.**

- `billing.dto.ts` définit `monthly/semester/yearly/group`.
- Le webhook utilise `order.plan`, puis `creditEntitlement` écrit `args.plan` (`billing.service.ts:144,182`).
- `0018_mvp_integrity.sql` impose à `entitlements.plan` seulement `free/premium`. Aucune migration suivante du checkout n'élargit cette contrainte.
- Avec une commande mensuelle préenregistrée et un provider de test confirmant le paiement, le **vrai BillingService sur la vraie couche Drizzle/PGlite** échoue :

```text
23514 entitlements_plan_check
new row for relation "entitlements" violates check constraint "entitlements_plan_check"
```

Le provider externe est simulé, pas le service métier ni l'exécution SQL. Ce test ne prouve pas l'intégration Chargily réelle, mais prouve le conflit interne après confirmation.

**Correction conceptuelle :** séparer le SKU commercial/durée (`monthly`, etc.) du niveau de droit (`premium`), aligner schéma et application, puis tester les quatre plans, promos, webhooks répétés et concurrence.

### B. Cartes premium et brouillons accessibles au lecteur authentifié — reproduit au niveau service/guard

**Priorité : contrôle d'accès et diffusion de contenu non validé.**

- `ContentController` impose JWT + RBAC, mais ses routes de lecture n'exigent pas de rôle éditorial (`content.controller.ts:21–58`).
- `RbacGuard` autorise une route sans rôle requis.
- `listDeckCards` ne reçoit pas `userId`, ne contrôle pas l'entitlement et ne filtre pas `status='published'` (`content.service.ts:96–148`).
- La reproduction crée un deck premium et une carte `draft`, puis retrouve **le contenu intégral** dans la réponse du service. Le vrai guard autorise le rôle student sur ce handler.

Ce n'est pas un test HTTP complet de production ; c'est la combinaison vérifiée de la politique du handler, du vrai guard et du vrai service sur une base exécutant les migrations. Elle suffit à invalider l'assurance « données privées jamais envoyées ».

### C. Un auteur peut approuver puis publier lui-même — reproduit

**Priorité : autorisations éditoriales et intégrité du contenu médical.**

`transitionCard` exige seulement `author` (`content.controller.ts:72–84`). Le service vérifie l'ordre des états, pas le rôle requis pour chaque transition ni une séparation auteur/relecteur (`content.service.ts:254–286`).

La reproduction confirme que le guard autorise un auteur, puis que le même utilisateur peut faire :

```text
draft → review → approved → published
```

Une machine à états n'est pas une politique d'autorisation. Des cartes IA placées initialement en draft ne sont donc pas, à elles seules, la preuve d'une validation médicale indépendante obligatoire.

### D. MFA de la copie Drive : algorithme TOTP incompatible — confirmé par lecture et calcul indépendant

**Priorité : bloqueur si cette version doit être déployée/réintégrée.**

SHA-1 simple à la place de HMAC, unité temporelle fausse, secret stocké en clair, consommation concurrente des backups non atomique. Le rapport P3 a manqué ces défauts tout en affirmant la conformité RFC. **Ne pas réintroduire ce code en le considérant audité.** Le checkout courant n'a pas ce MFA ; son absence doit elle-même être traitée selon les exigences de sécurité admin.

### E. CMS et infrastructure : pièces présentes mais parcours non terminés

- Upload média : URL stub, pas signature R2 réelle.
- Liste CMS serveur : pas de transmission de cookie navigateur par le helper actuel.
- Probes K8s/Helm et nom de variable JWT incompatibles avec la configuration applicative inspectée.
- Redis et tracing non activés dans le chemin applicatif.

Ces défauts montrent pourquoi « le build passe » et « les manifests existent » ne valent pas « le service est exploitable ».

---

## 5. Les sept batches : avis individuel et usage correct

Les batches sont des **captures textuelles du code**, pas des rapports à noter vrai/faux. Ils ne sont pas associés à un SHA et leur totalité n'a pas été vérifiée ici.

| Fichier | Ce que j'ai effectivement contrôlé / avis |
|---|---|
| `batch_P1.txt` | Début et README consultés. La contradiction sur les `.g.dart` est bien dans cette capture. Ne prouve pas l'état réel de la CI. |
| `batch_P2.txt` | Début, environnement/Docker consultés. Capture différente du checkout sur certains fichiers ; ne permet pas de conclure qu'une clé locale était committée. |
| `batch_P3.txt` | Auth initiale et sections magic link/MFA/RBAC ciblées. **Pièce décisive : contredit P3 sur HMAC, temps et secret stocké.** |
| `batch_P4.txt` | Début et logique adaptative consultés. Confirme des règles/seuils, pas leur efficacité clinique ou pédagogique. |
| `batch_P4b.txt` | Début, factory LLM et rétention consultés. Certains en-têtes annoncent des milliers de « lignes » pour des petits fichiers ; les métriques du batch sont suspectes et ne doivent pas servir de références de ligne. |
| `batch_P6.txt` | Contrôleur, DTO, service billing et début provider consultés. **Confirme le défaut de commande préalable dans cette capture**, contrairement au checkout actuel. |
| `batch_P6b.txt` | Début gateway/notifications consulté. Même problème d'en-têtes de longueur : `rest-backend.port.ts` annoncé à 1477 « lignes » pour un court fichier. Aucune preuve d'envoi push réel. |

Liens Drive : [P1](https://drive.google.com/file/d/1h5p9l2XB70qx1uwXZop2-_gPdRM31xbK/view), [P2](https://drive.google.com/file/d/1xlMwe4JmLJk7y2C2tzzwztzNahfXs9AQ/view), [P3](https://drive.google.com/file/d/1eMUn4Mwv2tUBIVhe12evq2T69Vs4GyyS/view), [P4](https://drive.google.com/file/d/1RhYb_43ujR8W65Vl8oZMD-Y4O37uHaWD/view), [P4b](https://drive.google.com/file/d/11hfogjyu4Jqy2lXeO0GNhVDkc3MO6TWn/view), [P6](https://drive.google.com/file/d/10r6wpokXYcNw6ST8_gcNzrGhbQl3qS0g/view), [P6b](https://drive.google.com/file/d/1yUB9d67xgXm7SLuI_-dAVEHHW8yeAp3C/view).

---

## 6. Plan raisonnable, sans note arbitraire

### Avant d'accepter des paiements et diffuser le contenu premium

1. Figer **le commit effectivement destiné à la livraison**. Reproduire l'audit sur celui-là, pas sur un dossier local sans provenance.
2. Corriger le mapping plans commerciaux/droits SQL et prouver le parcours checkout → webhook → droit utilisable avec base réelle.
3. Fermer les lectures de brouillons et contrôler les abonnements côté serveur.
4. Imposer les rôles par transition éditoriale, avec décision explicite sur la séparation auteur/relecteur.
5. Définir un MFA admin éprouvé et interopérable si requis. Ne pas se fier à la copie Drive ni à son rapport de conformité.
6. Mettre à jour les dépendances vulnérables avec tests de régression. Séparer exposition production, outils de développement et conditions d'exploitation.

### Avant de déclarer le déploiement prêt

7. Exécuter un déploiement réel : clé JWT montée au bon chemin, probes exactes, migrations, démarrage, restauration de sauvegarde.
8. Brancher Redis avant la construction du store de budget, et tester deux instances. Brancher et observer réellement les traces.
9. Ajouter les FK manquantes avec une stratégie de migration et d'effacement compatible avec les triggers append-only.
10. Terminer l'auth serveur du CMS, l'upload médias et les fonctionnalités incluses dans le périmètre annoncé.
11. Compiler/tester Flutter et effectuer un parcours appareil : authentification, téléchargement autorisé, étude hors ligne, synchronisation et expiration des droits.
12. Remplacer les slogans « scientifiquement validé » et « médicalement sécurisé » par les preuves précises disponibles et leurs limites.

**Conclusion : du code utile existe, et les tests ne sont pas fictifs. Mais ces rapports racontent un système plus achevé, plus sécurisé et mieux prouvé que ce que leurs propres pièces et le checkout permettent d'établir. À utiliser comme liste de pistes à vérifier — pas comme certificat de maturité.**
