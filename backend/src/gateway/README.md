# Gateway GraphQL v2 — Stratégie de migration REST → GraphQL (Phase 20.2)

## Pourquoi des opérations persistées ?

Le GraphQL classique (requêtes arbitraires) pose trois menaces qu'un
simple cost-limit ne couvre pas : injection de champs (`__schema`),
re-quêtes profondes (n+1), et coût imprévisible. Le gateway de MedAnki
n'accepte **que des opérations déclarées** (`persisted-operations.ts`)
: le texte normalisé de la requête du client doit correspondre
exactement à l'empreinte d'une opération de l'allow-list. C'est le
modèle « trusted documents » (Apollo persisted queries) réimplémenté
sans dépendance externe.

## Flux

```
client                     POST /v2/graphql {query, variables}
  │  JwtGuard (même JWT que REST)
  ▼
GatewayController          feature flag GRAPHQL_ENABLED (503 si OFF)
  │  Zod strict (gateway.dto.ts)
  ▼
GatewayService
  │  1. matchPersistedOperation  → 400 OPERATION_NOT_PERSISTED
  │  2. variables.safeParse      → 400 BAD_VARIABLES
  │  3. budget coût horaire      → 429 COST_BUDGET_EXCEEDED (500/h/user)
  │  4. RestBackend.get (loopback 127.0.0.1:/v1, JWT forwardé)
  │  5. shape()                  → shape GraphQL documentée
  ▼
REST /v1 existante (mêmes permissions — aucune élévation)
```

## Ajouter une opération (checklist)

1. Déclarer dans `persisted-operations.ts` : `name`, `sdl` exacte,
   `cost`, `variables` (Zod strict), `rest.path` + `queryKeys`,
   `shape`.
2. Documenter dans `schema.graphql` (type + bloc opérations).
3. Étendre `DELEGATION_PATHS` de `tools/scripts/check_graphql.py`.
4. Tests : reuse du gabarit `graphql_gateway.test.ts`.
5. Jamais de mutation tant que le modèle d'autorisation GraphQL n'est
   pas éprouvé (v1 lecture seule).

## Budget de coût

Mémoire d'instance (best-effort multi-pods ; chaque pod a sa fenêtre —
conservateur, ne dépasse jamais N× le budget global avec N pods, ce qui
reste borné par le throttle global `ThrottlerModuleConfigured`).
Upgrade documentée : stocker les entrées dans Redis (même contract de
fonctions `budgetUsed`/`budgetRemaining`) quand le trafic le justifiera.

## Après v1

* v1 : lecture seule, 5 opérations couvrant stats/decks/adaptive/
  examens/leaderboard — clients tiers et future web app.
* v2 (Phase 20+) : mutations signées, coût pondéré par profondeur,
  introspection restreinte à l'environnement de dev.
