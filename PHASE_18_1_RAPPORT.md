# Phase 18.1 — Hints adaptatifs (sans LLM)

> Statut : **terminée**. Pour chaque carte, l'API retourne un hint
> contextuel personnalisé, calculé par règles à partir du profil SRS
> de l'utilisateur — aucun LLM externe (trop cher pour le marché
> algérien), latence nulle, coût nul.

## Livré

```
backend/src/ai/
├── ai.module.ts               (nouveau module IA — accueillera 18.2→18.6)
└── hints/
    ├── hint-templates.ts      (7 catégories × 3 langues, fonctions typées)
    ├── hints.service.ts       (profil dérivé + sélection + orchestration DB)
    ├── hints.controller.ts    (GET /v1/ai/hints/:cardId)
    └── hints.dto.ts           (HintQuery Zod + HintResponse)

backend/test/unit/
└── ai_hints.test.ts           (25 cas : expérience, tags, priorités,
                                templates fr/ar/en, justification, Zod)

backend/src/app.module.ts      (AiModule monté)
```

## Choix structurants

### Profil d'expérience *dérivé*, pas déclaré

Contrairement à l'onboarding (Phase 15.3) qui demande le niveau, ici il
est **recalculé** depuis `review_logs` :

* `< 50` revues → `beginner`
* `≥ 500` revues **ET** taux de lapses `< 25 %` → `advanced`
* sinon → `intermediate`

Le niveau suit donc la progression réelle de l'étudiant sans intervention.

### 7 catégories, ordre de priorité strict

| # | Catégorie | Déclencheur |
|---|---|---|
| 1 | `leech_help` | `is_leech` ou lapses ≥ 4 (avant le seuil de suspension = 8) |
| 2 | `first_encounter` | carte `new` ET utilisateur débutant |
| 3 | `exam_link` | carte liée à une question d'examen (Phase 10) |
| 4 | `difficulty_high` | D FSRS ≥ 7/10 ou hint éditorial ≥ 4/5 |
| 5 | `due_pressure` | retard de révision ≥ 3 jours |
| 6 | `consolidation` | 1 à 3 passages |
| 7 | `memory_anchor` | fallback |

La priorité va du signal le plus **actionnable** (aider sur une carte
qui bloque) au plus générique. Un hint `leech_help` masque un
`exam_link` : on soigne d'abord la saignure.

### Templates en fonctions, trilingues

Chaque template est une fonction `(ctx) => string` : l'interpolation
est typée (`HintContext`) et testée unitairement en fr / ar / en.
L'ancre mémorielle (`anchor`) est le premier tag non générique —
les tags trop vagues (`anatomie`, `pcem1`, `général`…) sont filtrés.

### Personnalisation explicable

La réponse inclut `based_on` (ex. `category:leech_help`,
`lapses:5`, `experience:beginner`). Conformité doc v2 §13 :
le moteur doit pouvoir justifier ses décisions.

## Conformité v2 (Phase 18.1)

| Exigence | État |
|---|---|
| Hint basé sur le profil (expérience, historique, langue) | ✅ |
| S'appuie sur la session + le SRS, pas un LLM | ✅ règles pures |
| Langue = préférence utilisateur, surcharge `?lang=` | ✅ |
| Endpoint protégé (JWT) + validation Zod stricte | ✅ |
| Explicabilité (`based_on`) | ✅ |

## Vérification

```bash
cd backend
npm run test -- ai_hints.test.ts
# 25 cas : 5 expérience + 4 tags/ancre + 12 priorités + 9 templates/Zod/justification
```

## Hors périmètre (reporté)

* Mise en cache des hints (Redis Phase 17) — le calcul est O(3 requêtes
  indexées), inutile tant que P95 < 500 ms.
* A/B testing des formulations — nécessite du trafic réel.
* Mobile : widget `HintBanner` branché sur cet endpoint — à faire côté
  Flutter quand l'UI d'étude le permettra.
