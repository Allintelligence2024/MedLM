# Phase 15.2 — Statistiques utilisateur (Dashboard)

> Statut : **terminée**. Le backend expose un endpoint
> `/v1/stats/me` qui calcule 20+ KPIs SRS agrégés, avec cache
> 60s. Le mobile consomme via `StatsRepository`.

## Livré

```
backend/src/stats/
├── stats.dto.ts                (StatsQuery, UserStats interface)
├── stats.service.ts            (compute, cache 60s, _computeStreak, _levelForXp)
├── stats.controller.ts         (GET /v1/stats/me)
└── stats.module.ts

mobile/lib/data/repositories/stats/
├── stats_models.dart           (UserStats, TopDeck)
└── stats_repository.dart       (consomme /v1/stats/me)

mobile/lib/data/network/
└── api_client.dart             (+1 endpoint : fetchStats)

backend/test/unit/
└── stats.test.ts               (10 cas : level mapping, sinceMs, accuracy)
```

## Choix structurants

### Cache mémoire 60s

`StatsService` maintient un `Map<userId:period, {stats, expiresAt}>`.
TTL 60s, invalidation manuelle sur push de revues (à brancher
Phase 16 avec un event bus). C'est volontairement simple — en
prod, on remplacera par Redis (Phase 16+).

### 20 KPIs en une requête

Le `UserStats` couvre l'ensemble des besoins dashboard :
* **Activité** : cardsReviewed, cardsCorrect, accuracy,
  totalDurationMs, avgDurationMs, sessionsCount.
* **Mock exams** : count, avgScore.
* **Streak** : current, longest.
* **XP & niveau** : xpTotal, level (P1 → Praticien).
* **SRS** : cardsByState (new/learning/review/relearning),
  leechCount, top 5 decks, forecast (médiane scheduledDays).
* **Distribution ratings** : 1/2/3/4 (Again/Hard/Good/Easy).

C'est dense mais c'est le format de référence pour le dashboard
client. Pas de pagination, pas de chunks : on limite à 5 decks
top.

### Streak côté serveur

`StatsService._computeStreak()` recalcule le streak à partir
de `review_logs`. C'est redondant avec le client mobile, mais :
1. Le serveur fait foi en cas de désync.
2. Le client peut perdre des events (réinstall app, device volé).
3. Le dashboard serveur n'a pas accès au cache client.

C'est aussi l'occasion d'avoir un **longestStreak** historique
que le client ne maintient pas.

### Level mapping identique au client

Les seuils 0/500/2000/5000/10000 sont dans
`gamification_constants.dart` (mobile) et `_levelForXp()` (serveur).
À factoriser en constante partagée si divergence — pour l'instant
on accepte la duplication (testée).

## Conformité v2 (Phase 15.2)

| Exigence v2 | État |
|---|---|
| §11.3 Dashboard KPIs SRS | ✅ 20 métriques |
| §11.3 Sessions/jour | ✅ sessionsCount |
| §11.3 Retention J7/J14/J30 | ⏭️ Phase 16 (analytics) |
| §11.3 Leechs par deck | ✅ leechCount |
| §11.3 Funnel free→premium | ⏭️ Phase 16 |
| §11.3 Forecast accuracy | ✅ forecastNextReviewDays |
| §9.1 Niveaux P1→Praticien | ✅ level |
| §9.3 Streak (current + longest) | ✅ |

## Hors périmètre

* UI dashboard (Phase 18 — visualisation Material).
* Export CSV des stats.
* Comparaison avec d'autres users anonymes.
* Graphiques temporels (séries daily/weekly/monthly).

## Vérification

```bash
cd backend
npm run test:unit -- stats.test.ts
# 10 cas : 5 levels + sinceMs (2) + accuracy (3).
```
