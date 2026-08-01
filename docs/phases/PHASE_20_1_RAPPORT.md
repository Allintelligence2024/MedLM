# Phase 20.1 — Multi-régions : Alger (primary), Oran, Constantine (répliques)

> Statut : **terminée**. Topologie multi-régions 100 % algérienne
> (loi 18-07) : module de régions pur et testé, overlays Kustomize par
> région, endpoint d'introspection `/regionz`, verrou statique
> `check_regions.py`.

## Livré

```
backend/src/common/regions/regions.ts   (REGIONS, parseRegion,
   routingFor — pur, aucune lecture d'env hors parseRegion)
backend/src/health/health.controller.ts (+ GET /regionz)
backend/test/unit/regions.test.ts       (12 cas : allow-list DZ, 1
   primary, routage écriture→primary, lecture→locale)

deploy/k8s/overlays/regions/
  alger/kustomization.yaml        (namespace medanki-alger, primary, 6→24)
  oran/kustomization.yaml         (namespace medanki-oran, replica, 3→12)
  constantine/kustomization.yaml  (namespace medanki-constantine, replica, 3→12)

tools/scripts/check_regions.py    (allow-list DZ stricte, 1 primary,
   overlays complets, 0 secret régional)
```

## Architecture

```
            GeoDNS / LB (health: /regionz, /readyz)
        ┌───────────────┬───────────────┬───────────────┐
        │ medanki-alger │ medanki-oran  │ medanki-cst   │
        │  PRIMARY      │  REPLICA      │  REPLICA      │
        │  écritures ✓  │  lectures ✓   │  lectures ✓   │
        │  lectures ✓   │  écritures → Alger            │
        └───────┬───────┴───────────────┴───────────────┘
                │   réplication Postgres (prod overlay : primary/replica svc)
```

### Règles (verrouillées par tests + check_regions.py)

* **Jamais de région hors Algérie** : `parseRegion('eu-west-1')` jette ;
  l'allow-list {alger, oran, constantine} est recoupée avec le module
  TypeScript à chaque push. Les données restent au pays (18-07,
  PRIVACY.md §5).
* **Écritures toujours au primary** (`routingFor(...).writes ===
  'primary'`) : cohérence forte du fold SRS — pas de conflit multi-master.
* **Lectures locales** sur les répliques (`reads === 'local'`) :
  objectif P95 < 500 ms sur tout le territoire (cibles documentées :
  120 ms alger, 250 ms répliques).
* `/regionz` expose région + routage (non sensible) pour le debug
  GeoDNS/LB ; le readiness existant reste inchangé.
* **Aucun secret dans les overlays régionaux** — les secrets restent
  centralisés et chiffrés dans `overlays/prod/secrets`.

## Vérification

```bash
python3 tools/scripts/check_regions.py      # ✓
python3 tools/scripts/security_audit.py     # ✓ 0 violation
cd backend && npm run test -- regions.test  # vitest (CI)
```

## Hors périmètre (reporté, opérationnel)

* Activation effective de la réplication Postgres inter-régions
  (les services primary/replica existent déjà dans l'overlay prod,
  Phase 17) + runbook de bascule froide.
* Routage applicatif des lectures vers la DSN de la réplique locale
  (`DATABASE_READ_URL`) — branchement db.module quand l'infra régionale
  est commandée ; contract déjà défini par `routingFor`.
* CDN périphérique multi-PoP pour les médias de cartes.
