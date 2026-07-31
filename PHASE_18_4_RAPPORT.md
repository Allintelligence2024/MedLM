# Phase 18.4 — Adaptive learning (FSRS ajusté + signaux auteur)

> Statut : **terminée**. Le SRS ajuste dynamiquement la difficulté
> perçue (poids FSRS) en fonction des patterns d'erreur de
> l'utilisateur sur 30 jours glissants ; les cartes qui font échouer
> **plusieurs** utilisateurs de façon répétée remontent un signal à
> l'auteur.

## Livré

```
backend/src/ai/adaptive/
├── adaptive.service.ts        (analyse pure + orchestration DB)
├── adaptive.controller.ts     (3 endpoints)
└── adaptive.dto.ts            (Zod — query + scan body)

backend/src/db/schema/ai.ts              (+ ai_difficulty_signals)
backend/src/db/migrations/0013_ai_difficulty_signals.sql
backend/test/unit/ai_adaptive.test.ts    (18 cas)
PHASE_18_4_RAPPORT.md
```

## Choix structurants

### Profil d'erreur sur fenêtre glissante (30 j)

`analyzeErrorPatterns(rows)` calcule : volume de revues, taux
d'échec (`rating=1`), cartes « leech candidates » (≥ 3 lapses et
≥ 50 % d'échecs) et « hot tags » (≥ 5 revues et ≥ 40 % d'échecs,
normalisés/dédupliqués). Le client peut ainsi afficher « vous
bloquez sur *nerf radial* ».

### Ajustement FSRS conservateur et justifié

Pas de ML opaque : deux règles bornées, actives seulement avec du
recul (≥ 100 revues) :

| Profil | Règle | Justification |
|---|---|---|
| fragile : échecs ≥ 30 % | `w[11] × 1.15` | la stabilité post-oubli se reconstruit plus vite (moins d'épuisement) |
| fort : échecs ≤ 5 % et ≥ 200 revues | `w[8] × 1.05` | les rappels réussis espacent davantage (moins de révisions inutiles) |

Garde-fous non négociables : chaque poids reste dans `[0.5×, 2×]`
de la base FSRS-5 (`clampWeights`), 19 poids toujours, et chaque
ajustement expose sa `reason` (doc v2 §13 — explicabilité).

### Signal auteur : « ce sont les cartes, pas les étudiants »

`POST /v1/ai/adaptive/signals/scan` (rôle editor+) agrège les lapses
par (carte × utilisateur) sur 30 j et crée un signal
`repeated_lapses` quand ≥ 5 utilisateurs cumulent ≥ 3 lapses chacun
sur la même carte. **Idempotent** : index partiel
`UNIQUE (card_id) WHERE status='open'` — un scan cron quotidien ne
duplique jamais. Les auteurs voient la file via
`GET /v1/ai/adaptive/signals` (rôle author+).

### Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/v1/ai/adaptive/profile` | tout utilisateur (son profil) |
| GET | `/v1/ai/adaptive/signals` | author+ |
| POST | `/v1/ai/adaptive/signals/scan` | editor+ |

## Conformité v2 (Phase 18.4)

| Exigence | État |
|---|---|
| Ajustement dynamique des poids FSRS (w) | ✅ 2 règles bornées |
| Basé sur les patterns d'erreur réels | ✅ review_logs 30 j |
| Signal à l'auteur (cartes défaillantes) | ✅ table + scan idempotent |
| Explicabilité | ✅ `reasons` + `fsrs_adjustment.active` |
| Tests | ✅ 18 cas |

## Vérification

```bash
cd backend
npm run test -- ai_adaptive.test.ts
# 18 cas : fenêtre glissante, leech, hot tags, ajustements/clamps FSRS,
# signaux (seuils, distinct users, tri), Zod.
```

## Hors périmètre (reporté)

* Application effective des poids ajustés côté mobile : l'endpoint
  les expose ; la prise en charge dans le moteur Dart (et les golden
  tests de parité) est un chantier à part — les clients continuent
  d'utiliser les poids de base tant qu'il n'est pas livré.
* Résolution des signaux depuis le CMS (bouton "corrigée") : la
  colonne `resolved_at/resolved_by` est prête, l'UI Phase 11 bis
  pourra l'exploiter.
* Ajustement par tag (w spécifiques "anatomie") — Phase 20 (ML).
