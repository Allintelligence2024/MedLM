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

## Ce qui reste ouvert

1. **Installer les workflows** — une commande, depuis un compte
   disposant de la permission `workflows` (`ci/README.md`). Tant que ce
   n'est pas fait, rien n'est rejoué automatiquement.
2. **Compiler le mobile pour de vrai** — le SDK Flutter et pub.dev sont
   inaccessibles depuis l'environnement de cette session. Le code Dart
   est validé statiquement (structure, imports, i18n, parité FSRS) mais
   `flutter analyze` / `flutter test` n'ont pas pu être exécutés.
   C'est le premier retour attendu de `mobile-ci.yml`.
3. **Le keystore de release et les secrets `ANDROID_*`** — la
   configuration qui les consomme est en place, les clés ne peuvent pas
   venir du dépôt.
4. **Le parcours « rejoindre un pack de groupe »** côté mobile : le
   bouton existe, désactivé, faute de cadrage produit (qui saisit le
   code, à quel moment, que voit un membre déjà inscrit).
