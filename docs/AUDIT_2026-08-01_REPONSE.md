# Réponse à l'audit du 2026-08-01

Ce document trace, item par item, ce qui a été fait, ce qui a été
délibérément laissé en l'état, et pourquoi. Il complète les rapports de
phase (`docs/phases/`) sans les remplacer.

## Bugs découverts *pendant* la correction

L'audit demandait de corriger des manques connus. En les corrigeant,
quatre défauts non listés sont apparus — tous invisibles pour la même
raison : **aucune CI n'exécutait ni le SDK Dart, ni les migrations, ni
un vrai PostgreSQL** (P0-3).

| Découverte | Gravité | Statut |
|---|---|---|
| `src/db/migrations/meta/_journal.json` absent — drizzle `migrate()` ne lit QUE ce fichier, donc `npm run db:migrate` échouait à 100 % : aucune base n'avait jamais pu être provisionnée par le chemin officiel | bloquante | corrigé, verrouillé par `migrations_journal.test.ts` |
| `sync_outbox.dart` déclarait une classe **imbriquée** (interdit en Dart) | ne compilait pas | corrigé (`SyncOutcome` hoistée) |
| `exam_anticheat.dart` faisait `AntiCheatKindWire()` — instanciation d'une **extension** | ne compilait pas | corrigé (`kind.wire`) |
| `stats_repository.dart` : import relatif faux (`../network/` au lieu de `../../network/`) | ne compilait pas | corrigé |
| `retention.service.ts` lisait `user_devices.device_token` — colonne qu'**aucun code n'écrivait jamais** | la liste d'appareils était donc toujours vide : **pas une seule alerte de rétention ne partait** | corrigé (lit `device_tokens`) |
| `DeviceTokensService.markUnreachable()` sans appelant | les appareils désinstallés étaient retentés indéfiniment | corrigé, 20 tests |
| `createShare` mobile envoyait `card_id` au lieu d'`attempt_id` | l'appel aurait été refusé en 400 par Zod | corrigé |

## Bugs trouvés en EXÉCUTANT le logiciel

Un PostgreSQL 16.2 réel a pu être obtenu (paquet PyPI `pgserver`, qui
embarque les binaires). Appliquer les migrations et démarrer le binaire
compilé — deux choses jamais faites — a révélé quatre défauts de plus,
dont une faille de sécurité.

| Découverte | Effet réel |
|---|---|
| **`0001_init.sql` ne contenait que des commentaires** | les 15 tables fondatrices (`users`, `cards`, `decks`, `review_logs`…) n'étaient créées par aucune migration : `db:migrate` échouait dès 0002 sur « relation "review_logs" does not exist ». La base n'avait jamais pu être provisionnée |
| **`nest build` ne produisait pas `dist/main.js`** | `tsconfig.json` inclut `test/**/*`, donc la racine de sortie glissait vers `dist/src/`. `npm start`, `start:prod` et le `CMD` de l'image Docker échouaient tous — CrashLoopBackOff au premier déploiement |
| **`migrate.ts` cherchait `./src/db/migrations`** | chemin absent de l'image Docker, où le Dockerfile range les `.sql` dans `dist/db/migrations` |
| **🔴 Repli JWT sur un secret du dépôt** | sans `JWT_SIGNING_KEY_PATH`, l'app signait en HS256 avec `dev-only-secret-do-not-use-in-prod`, **y compris en `NODE_ENV=production`**. Un jeton `role: admin` forgé en trois lignes obtenait **200** sur les endpoints protégés |
| **Signature RS256 sans clé de vérification** | signer lit `JWT_SIGNING_KEY_PATH`, vérifier lit `JWT_PUBLIC_KEY_PATH` : renseigner l'une sans l'autre donnait **401 sur toutes les requêtes authentifiées**. Le serveur démarre, l'inscription marche, et plus rien d'autre |
| **🔴 Rotation de refresh token inopérante** | `revokedAt` était positionné à chaque rotation mais **jamais relu** : un jeton révoqué (ou expiré) restait valable indéfiniment. Un jeton volé survivait au rafraîchissement de la victime |
| **HTTP 500 sur tout push de synchronisation** | `= ANY(${ids}::uuid[])` — drizzle interpole le tableau JS comme un paramètre scalaire : « malformed array literal ». **La boucle centrale du produit** était inutilisable |

La faille JWT avait une cause aggravante : `security_audit.py` exemptait
toute ligne contenant « dev-only » ou « do-not-use ». Le secret
s'appelant littéralement `dev-only-secret-do-not-use-in-prod`, **il
s'auto-exemptait de l'audit censé le détecter**. La sentinelle ne vaut
désormais que dans les commentaires.

Un parcours métier complet (`tools/scripts/check_business_flows.sh`,
17 vérifications) tourne désormais contre le binaire compilé et la vraie
base : inscription, RS256, rotation et rejeu, enregistrement d'appareil
et idempotence, push/pull SRS, onboarding, entitlement, métriques.
C'est ce script qui a révélé les trois dernières lignes du tableau.

Vérifié dans la foulée, pour la première fois contre une vraie base :
les 6 triggers append-only existent **et mordent** — `UPDATE` et
`DELETE` sur `review_logs` échouent. C'est l'invariant le plus critique
du produit (« la perte d'une revue est le seul bug irrattrapable »,
v2 §14), et il n'avait jamais été exercé ailleurs que sur SQLite.

Pour que cette classe d'erreurs ne repasse plus sans SDK :
`tools/scripts/check_dart_static.py`.

## P0 — bloqueurs

| Item | Statut | Détail |
|---|---|---|
| **P0-1** routage `/v2/graphql` | déjà corrigé | avant ce lot |
| **P0-2** mobile non compilable | **fait** | `main.dart`, routeur go_router, DI Riverpod, thème, config par `--dart-define`, 12 écrans. Dossiers de plateforme **non versionnés** (régénérés par `flutter create` en CI, cf. `mobile/README.md`). Code Drift : commité, fraîcheur vérifiée en CI |
| **P0-3** CI/CD absente | **fait, à activer** | 4 workflows dans `ci/workflows/` — l'app GitHub de session n'a pas la permission `workflows`, l'installation est une commande (`ci/README.md`) |
| **P0-4** aucune image constructible | **fait** | `backend/Dockerfile` (multi-stage, non-root, healthcheck), `cms/Dockerfile` (standalone), `docker-compose.yml`, `docker build` vérifié en CI |

## P1 — manques produit

| Item | Statut | Détail |
|---|---|---|
| **P1-1** résidus AI Studio | **fait** | 8 artefacts supprimés, README racine réécrit, 50 rapports déplacés sous `docs/phases/`. Migrations renumérotées 0012–0017 → 0011–0016 (le gap est comblé, pas documenté : rien n'était déployé) |
| **P1-2** écrans manquants | **fait** | 12 écrans livrés ; la couche UI passe de 8 à 20 |
| **P1-3** notifications | **fait** | Backend : OAuth2 par compte de service (le token statique aurait cessé de fonctionner après 1 h) + table `device_tokens` + endpoints + **désactivation des appareils injoignables** (410/404 interprétés, `markUnreachable` n'avait aucun appelant). Mobile : FCM, remontée et rotation du jeton, deep links, écran de permission. APNs : la signature ES256 et le cache de jeton étaient déjà là ; il ne manquait que l'interprétation des codes d'échec, désormais faite |
| **P1-4** i18n mobile | **fait, terminé** | 177 clés × FR/AR/EN. Les 7 écrans antérieurs **ont été migrés** : la liste d'exception est **vide**. Les messages d'erreur en état (`_error`, `_bannerError`) sont devenus des codes, pas des phrases — sinon ils resteraient figés dans la langue en vigueur au moment de l'échec |
| **P1-5** dépendances | **fait** | Riverpod devient la DI ; mocktail/fake_async en dev ; uuid retiré |

## P2 — dette technique

| Item | Statut | Détail |
|---|---|---|
| **P2-1** `DRIZZLE_READ` inutilisé | **fait** | Injecté dans stats, leaderboard et ML, derrière `READ_REPLICA_ENABLED`. Sans flag ET sans URL : strictement le comportement d'avant |
| **P2-2** budgets en mémoire | **fait** | Budget du gateway porté par Redis quand il est disponible (seaux d'une minute, TTL, repli mémoire si Redis tousse). À N pods, le budget était N × 500/h |
| **P2-3** observabilité | **fait** | Dashboard Grafana (9 panneaux) + règles d'alerte, `.env.example` complété. `medanki_http_requests_total` ajouté : sans dénominateur, « 5xx < 1 % » n'était pas exprimable |
| **P2-4** deck legacy embarqué | **fait** | Déplacé dans `assets/content_archive/` (hors bundle), garde `check_bundle_assets.py` |
| **P2-5** e2e jamais exécuté | **fait** | `npm run e2e` à la racine + job CI avec PostgreSQL |
| **P2-6** un seul test d'intégration | **fait** | 5 fichiers, 28 cas : routage, sync, refresh, webhook billing, chronométrage examen |
| **P2-7** CMS sans auth | **fait** | Page `/admin/login`, session par cookie, middleware Next protégeant `/admin/*`, 401 → redirection, bouton de déconnexion. Protection contre la redirection ouverte (`safeRedirectTarget`) |
| **P2-8** release build | **fait** (hors clés) | Icônes et splash configurés (visuels placeholder documentés). `mobile/proguard-rules.pro` (Flutter, FCM, WorkManager, crypto, secure storage) + `apply_android_release_config.py` qui corrige ce que `flutter create` produit : signature **debug** sur le build release, R8 et shrink désactivés, `applicationId com.example`. Idempotent, vérifié en CI. Reste à fournir : le keystore et les 4 secrets `ANDROID_*` |

## P3 — menu fretin

| Item | Statut |
|---|---|
| **P3-1** sitemap absent | **fait** — `site/sitemap.xml` (3 URLs + hreflang), déclaré dans `robots.txt`, vérifié par `check_landing.py` |
| **P3-2** 46 rapports à la racine | **fait** — `docs/phases/` |
| **P3-3** BACKGROUND_SYNC / sentry | **documenté** (ci-dessous), aucune action technique — conforme à la recommandation |
| **P3-4** share / group-packs / tenants sans UI | **fait** — bouton de partage sur l'écran de résultat d'examen (`share_plus`), pages CMS `/admin/tenants` (création, membres) et `/admin/group-packs` (recherche par code, sièges, échéance). Reste hors périmètre : le parcours produit « rejoindre un pack » côté mobile, à cadrer avec l'équipe |
| **P3-5** fixtures d'examen fines | **fait** — la voie « expiresAt côté serveur » est couverte en intégration |

### P3-3 — notes, sans action

**Cache de hints (`AiRepository`).** Le worker de fond rafraîchit les
poids FSRS adaptatifs mais ne purge pas le cache mémoire des hints.
C'est sans conséquence : ce cache vit dans l'instance de l'application,
il disparaît à chaque fermeture, et un hint légèrement périmé n'a aucun
effet sur la planification (il n'influence que l'aide affichée).
Le purger demanderait un canal de communication entre l'isolate de fond
et l'UI pour un bénéfice nul.

**`sentry.service` et le pool de forks vitest.** Le service lit sa
configuration via `ConfigService`, ce qui touche le système de fichiers
au boot. C'est ce qui justifie `pool: 'forks'` dans la configuration
vitest d'intégration. À surveiller si le projet migre vers un ESM
strict : le chargement dynamique de modules changerait de sémantique.

## Ce qui a été vérifié sans les outils correspondants

Cet environnement n'a **ni SDK Dart/Flutter, ni démon Docker**, et
pub.dev comme `storage.googleapis.com` y sont injoignables (seuls npm,
PyPI et l'API GitHub répondent). Plutôt que de renvoyer ces deux pans
entiers à la CI, ils ont été couverts par des vérifications qui rejouent
la partie du travail du compilateur qui compte le plus ici — celle qui
attrape les fautes commises **en volume** dans du code écrit à la main :

| Outil manquant | Ce qui le remplace | Ce qui est réellement prouvé |
|---|---|---|
| `flutter analyze` | `check_dart_static.py` | 0 classe imbriquée, 0 extension instanciée, `part`/imports résolus (a trouvé 3 fichiers jamais compilables) |
| `flutter analyze` | `check_l10n_usage.py` | les 148 appels `l10n.x(…)` existent, avec la bonne arité — testé en injectant les 3 fautes typiques (clé inexistante, getter appelé, mauvais nombre d'arguments) |
| `flutter analyze` | `check_dart_symbols.py` | méthodes et paramètres nommés d'`ApiClient`, membres d'`AppContainer`, providers, imports des tests — testé en injectant 4 fautes |
| `docker build` | `check_dockerfiles.py` | étapes `COPY --from`, sources présentes dans le contexte, **healthcheck sondant une route qui existe vraiment**, user non-root ; compose : volumes, dépendances, `service_healthy` — testé en injectant 4 fautes |
| exécution des workflows | `check_workflows.py` | YAML valide, `needs` déclarés, scripts et `working-directory` existants, `npm run` déclarés dans le bon package.json, 0 secret en dur — testé en injectant 4 fautes |

Chaque garde a été validée en y **injectant délibérément les erreurs
qu'elle prétend détecter** (15 injections au total), puis en restaurant
le code : une garde qui ne mord pas est pire qu'aucune garde — et deux
de mes premières versions ne mordaient pas.

Les workflows méritaient ce traitement pour une raison particulière :
ils sont en attente d'installation manuelle, donc ils ne seront exercés
qu'après une action humaine. Une faute de frappe y serait restée
invisible jusque-là.

> À propos de `dockerfilelint` (npm) : il signale `--start-period` comme
> invalide. C'est un faux positif connu — l'option est documentée depuis
> Docker 17.05 et le scanner de trivy a le même bug. Les Dockerfiles ont
> été relus à la main sur ce point plutôt que d'être « corrigés » vers
> une syntaxe inférieure.

Ce que cela ne remplace pas : l'inférence de types, la vérification de
nullabilité, l'analyse de flot, et la construction effective des images.
Ces quatre-là restent le premier retour attendu de la CI.

## Ce qui reste ouvert

1. **Installer les workflows** — une commande, depuis un compte
   disposant de la permission `workflows` (`ci/README.md`). Tant que ce
   n'est pas fait, rien n'est rejoué automatiquement.
2. **Compiler le mobile et construire les images** — voir la section
   précédente : quatre gardes couvrent désormais l'essentiel des fautes
   mécaniques, mais l'inférence de types, la nullabilité et le
   `docker build` effectif ne peuvent pas être simulés.
3. **Le keystore de release et les secrets `ANDROID_*`** — la
   configuration qui les consomme est en place, les clés ne peuvent pas
   venir du dépôt.
4. **Le parcours « rejoindre un pack de groupe »** côté mobile : le
   bouton existe, désactivé, faute de cadrage produit (qui saisit le
   code, à quel moment, que voit un membre déjà inscrit).
