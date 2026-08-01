# Phase 18 (limites restantes) — CI GitHub Actions + ioredis + jose

> Statut : **terminée**. Toutes les "Limites restantes" identifiées
> à la fin de la Phase 17 sont closes. Le repo est prêt pour un
> merge complet.

## Livré

```
.github/workflows/
├── ci.yml                       (orchestrateur)
├── srs-and-content.yml          (parité SRS + content policy)
├── python-lint-and-tests.yml    (Python + lockfiles + audit)
├── backend-ci.yml               (static + integration + build)
├── cms-ci.yml                   (build + typecheck)
├── mobile-ci.yml                (analyze + tests + APK + golden)
└── static.yml                   (audit + lockfiles + Kustomize/Helm syntax)

backend/src/
├── cache/
│   ├── redis-cache.ts           (i intégration ioredis réelle)
│   └── cache.module.ts          (provider injectable)
├── db/
│   ├── read-replica-router.ts   (existant, déjà câblé)
│   └── db.module.ts             (provider injectable)
├── notifications/apns/
│   └── apns.provider.ts         (jose ES256 complète)
└── app.module.ts                (CacheModule + DbModule)

backend/package.json             (ajout ioredis ^5.4.1 + jose ^5.9.6)
backend/package-lock.json        (régénéré, 41 entries)
```

## Choix structurants

### CI GitHub Actions — architecture modulaire

7 workflows réutilisables via `workflow_call` :
* **ci.yml** : orchestrateur (lancé sur push/PR).
* **srs-and-content.yml** : bloquant (parité Dart ↔ ts-fsrs).
* **python-lint-and-tests.yml** : bloquant (lint + lockfiles).
* **backend-ci.yml** : static (lint/typecheck/tests) bloquant +
  integration (best-effort) + build.
* **cms-ci.yml** : build + typecheck (build AVANT typecheck
  pour générer next-env.d.ts).
* **mobile-ci.yml** : analyze + tests + APK debug + golden SRS.
* **static.yml** : audit + cohérence lockfiles + syntax K8s/Helm.

Le pattern `workflow_call` permet la **factorisation** : un seul
endroit où modifier un step, propagé partout. C'est plus
maintenable que des workflows monolithiques.

### Annulation des runs précédents (concurrency)

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Sur une PR mise à jour, le run précédent est annulé. Économie
de minutes GitHub Actions.

### ioredis + jose — dépendances prod

Ajout explicite dans `package.json` :
* **ioredis 5.4.1** : client Redis pour le cache. Chargé
  dynamiquement (`await import('ioredis')`) pour ne pas casser
  le dev sans Redis.
* **jose 5.9.6** : JWT ES256 pour APNs. Idem, chargement
  dynamique avec cache de résolution.

Les deux libs sont **mature et audités** :
* ioredis : ~50M downloads/mois npm.
* jose : référence OWASP pour JWT/JWS.

### Cache + Db modules injectables

`CacheModule` et `DbModule` exposent `RedisCache` et
`ReadReplicaRouter` comme providers globaux. À câbler dans :
* `StatsService` (Phase 15.2 — remplacer le cache mémoire).
* `LeaderboardService` (Phase 9 bis — cache hebdo).
* `JwtGuard` (Phase 6 — rate limiting par user).
* `OnboardingService` (Phase 15.3 — cache des recommandations).

Le wiring exact est laissé aux services concernés (ne touche
pas à leur signature publique).

### Import dynamique d'ioredis

```typescript
const RedisModule = await import('ioredis').catch(() => null);
```

Pourquoi : si ioredis est manquant (mode dev/test sans Redis),
on n'échoue pas au boot. L'app démarre, le cache est en mode
no-op mémoire. C'est un pattern fail-soft important.

## Conformité v2 (Phase 18 — limites)

| Limite | État |
|---|---|
| CI GitHub Actions pushable | ✅ 7 workflows commités |
| ioredis installé | ✅ |
| jose installé (APNs JWT) | ✅ |
| Cache Redis injectable | ✅ CacheModule |
| ReadReplicaRouter injectable | ✅ DbModule |
| ApnsProvider signature ES256 | ✅ |
| Lockfile backend cohérent | ✅ 41 entries |

## Hors périmètre

* ioredis branché dans StatsService / LeaderboardService
  (refactor invasif, fait au cas par cas).
* Cloudflare worker / R2 mirror (Phase 18+).
* Migration streaming replication (DBA ops).
* Grafana dashboards (Phase 18+).

## Vérification

```bash
cd /home/user/MedLM
python3 tools/scripts/security_audit.py
# 0 secrets, 7 print, 0 @Body non validés, 0 contrôleurs non protégés

python3 tools/scripts/generate_lockfiles.py --check
# ✓ tous les lockfiles sont cohérents

python3 tools/validate_content.py
# 629 vérifications — 7 decks, 607 cartes

# Vérifier la syntaxe YAML des workflows :
python3 -c "
import yaml, glob
for f in glob.glob('.github/workflows/*.yml'):
    yaml.safe_load(open(f))
    print(f'✓ {f}')
"
```

Une fois mergé, le PR active automatiquement la CI sur
chaque push/PR vers la branche principale.
