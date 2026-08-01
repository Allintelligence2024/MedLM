# Phase 20.2 — GraphQL gateway (opérations persistées)

> Statut : **terminée**. Passerelle GraphQL en lecture seule au-dessus
> de la REST existante, avec le modèle de sécurité le plus strict du
> marché (trusted documents / persisted operations), zéro nouvelle
> dépendance, entièrement testée sur ses parties pures.

## Livré

```
backend/src/gateway/
  persisted-operations.ts      (allow-list : 5 opérations, SDL exacte,
                                coût, Zod strict des variables,
                                délégation REST + projection shape)
  rest-backend.port.ts         (port + impl loopback 127.0.0.1:/v1)
  gateway.service.ts           (match → Zod → budget coût → délégation
                                JWT forwardé → shaping)
  gateway.controller.ts        (POST /v2/graphql, JwtGuard, flag
                                GRAPHQL_ENABLED → 503 si OFF)
  gateway.module.ts            (monté dans AppModule)
  gateway.dto.ts
  schema.graphql               (contrat documentaire + opérations)
  README.md                    (stratégie de migration REST→GraphQL)

backend/test/unit/graphql_gateway.test.ts
  (24 cas : normalisation, rejet des requêtes arbitraires, Zod,
   budget fenêtre glissante + par utilisateur, shaping, erreurs
   contrôlées, contrat v1 lecture seule)

tools/scripts/check_graphql.py (noms/coûts/SDL, délégués REST
  réellement existants dans les contrôleurs, lecture seule, gardé —
  intégré en bloquant à phase13_checks.sh)
```

## Décisions structurantes

### Persisted operations, pas de requêtes arbitraires

L'empreinte (texte normalisé : commentaires et espaces ignorés) doit
correspondre à l'allow-list — `__schema`, mutations, champs inconnus →
`OPERATION_NOT_PERSISTED` (400). Testé, y compris la mise en page
libre (pretty-print accepté).

### Aucune élévation de privilèges

Le gateway **forwarde le JWT** de l'appelant à la REST interne
(loopback) : les mêmes gardes JwtGuard/RbacGuard s'appliquent. Une
opération persistée ne peut jamais voir plus que son appelant via REST.

### Budget de coût horaire

500 points/heure/utilisateur (coûts par opération : 5–15), fenêtre
glissante en mémoire d'instance (borné par le throttle global ;
upgrade Redis à contract constant documentée dans README).

### Flag de déploiement progressif

`GRAPHQL_ENABLED=false` par défaut → 503 propre. Le passage à GraphQL
est une décision ops, pas un redéploiement.

## Vérification

```bash
python3 tools/scripts/check_graphql.py      # ✓
python3 tools/scripts/security_audit.py     # ✓ (gardes + zod présents)
cd backend && npm run test -- graphql_gateway.test  # vitest (CI)
```

## Hors périmètre (reporté)

* Mutations signées + coût pondéré par profondeur (v2).
* Budget distribué Redis quand le trafic le justifiera.
* Consommation web publique (la web app marketing `site/` reste
  statique — la web app connectée consommera /v2/graphql).
