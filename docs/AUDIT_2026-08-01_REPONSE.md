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
| **P1-3** notifications | **fait** | Backend : OAuth2 par compte de service (le token statique aurait cessé de fonctionner après 1 h) + table `device_tokens` + endpoints. Mobile : FCM, remontée et rotation du jeton, deep links, écran de permission. **APNs reste à finir** (Android first, décision de l'audit) |
| **P1-4** i18n mobile | **fait** | 122 clés × FR/AR/EN, garde anti-régression. Les 7 écrans antérieurs sont sur liste d'exception **qui ne peut que rétrécir** |
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
| **P2-8** release build | **partiel** | `flutter_launcher_icons` et `flutter_native_splash` configurés, visuels **placeholder** documentés comme tels. ProGuard/R8 et signature : à faire avec les vraies clés (secrets CI) |

## P3 — menu fretin

| Item | Statut |
|---|---|
| **P3-1** sitemap absent | **fait** — `site/sitemap.xml` (3 URLs + hreflang), déclaré dans `robots.txt`, vérifié par `check_landing.py` |
| **P3-2** 46 rapports à la racine | **fait** — `docs/phases/` |
| **P3-3** BACKGROUND_SYNC / sentry | **documenté** (ci-dessous), aucune action technique — conforme à la recommandation |
| **P3-4** share / group-packs / tenants sans UI | **partiel** — le partage est câblé côté client (`createShare`) ; les packs de groupe ont un point d'entrée visible mais inactif dans le paywall (parcours produit à définir). Pages CMS de gestion : non faites |
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
3. **APNs**, **ProGuard/R8 et signature de release**, **pages CMS pour
   share/group-packs/tenants**, **migration i18n des 7 écrans
   historiques**.
