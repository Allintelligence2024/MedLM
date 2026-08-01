# Phase 9 bis — Leaderboard hebdo + Collection de badges

> Statut : **terminée**. Le serveur expose un leaderboard opt-in
> (pseudonyme, scope hebdo, segmentation faculté/année) et le
> mobile a deux nouveaux écrans : `LeaderboardScreen` et
> `BadgesScreen`.

## Livré

```
backend/src/
├── db/
│   ├── schema/gamification.ts        (3 tables : optin, snapshot, unlocks)
│   └── migrations/0005_gamification.sql
└── gamification/
    ├── gamification.module.ts
    ├── leaderboard.dto.ts            (Zod : OptInBody, LeaderboardQuery)
    ├── leaderboard.service.ts        (opt-in/out, top, snapshot, currentWeek ISO)
    ├── leaderboard.controller.ts     (4 endpoints)
    └── badges.controller.ts          (1 endpoint : liste badges débloqués)

mobile/lib/
├── data/
│   ├── network/api_client.dart       (+5 endpoints)
│   └── repositories/leaderboard/
│       ├── leaderboard_models.dart   (LeaderboardSnapshot, Entry)
│       └── leaderboard_repository.dart
└── ui/gamification/
    ├── leaderboard_screen.dart       (Material, opt-in dialog RGPD)
    └── badges_screen.dart            (grille 3 colonnes, débloqué/vérouillé)

backend/test/unit/
└── leaderboard.test.ts               (4 cas : format semaine, ISO 1er jan, lundi, 1er jan lundi suivant)
```

## Choix structurants

### Opt-in explicite (v2 §9.5)

* L'utilisateur **doit** choisir un pseudonyme (3-20 caractères,
  alphanum) avant d'apparaître dans le classement.
* L'email / user_id n'apparaît **jamais** dans la réponse publique.
* Le pseudonyme est unique (insensible à la casse). Conflit →
  `400 BadRequest`.
* Le bouton "Se désinscrire (RGPD)" est visible en permanence.

### Scope hebdo (semaine ISO)

* Format : `YYYY-Www` (ex. `2025-W42`).
* L'algorithme suit la RFC ISO 8601 : la semaine 1 est celle qui
  contient le 1er jeudi de l'année. Le lundi est le jour 1.
* Les snapshots sont stockés dans `user_xp_snapshot` — le top ne
  recalcule jamais sur `review_logs`.
* Le snapshot est posé par un job (à brancher en Phase 10+ via
  cron ou consumer de sessions).

### Tri déterministe

Tri composite : `xp_week DESC, cards_reviewed DESC, mock_exams DESC`.
Cela garantit que deux utilisateurs avec le même XP sont départagés
de façon reproductible (pas d'aléatoire, pas de timestamp).

### Pas d'email dans la réponse

`LeaderboardEntry` ne contient que `pseudonym`, `faculty`,
`study_year`, `xp_week`, `cards_reviewed`, `mock_exams`. C'est
aussi ce que la v2 §13 (RGPD) impose : minimisation.

### My rank hors top

Si l'utilisateur courant est opt-in mais hors du top N (par
ex. classé 412e sur 500 participants), on calcule son rang exact
via une sous-requête `> (xp, cards, mocks)`. Coût : un COUNT
supplémentaire — acceptable.

## Conformité v2 (Phase 9 bis)

| Exigence v2 | État |
|---|---|
| §9.4 Badges (9 jalons) | ✅ table `badge_unlocks` |
| §9.5 Leaderboard opt-in | ✅ |
| §9.5 Pseudonyme (pas d'identité réelle) | ✅ |
| §9.5 Scope hebdo | ✅ (semaine ISO) |
| §9.5 Segmentation faculté/année | ✅ query params |
| §13 RGPD opt-out | ✅ DELETE /opt-in |
| §9 Pas de leaderboard cosmétique | ✅ seulement XP/streak/examens |

## Hors périmètre

* i18n des chaînes de l'UI (Phase 17).
* Cron de snapshot automatique (Phase 10+).
* Anti-triche : un user qui spam les snapshots pour gonfler ses
  XP → on s'appuie sur le calcul XP côté serveur, déjà audité
  (Phase 7 + Phase 9).
* Push "Tu as été dépassé" (Phase 14+).

## Vérification

```bash
cd backend
npm run test:unit -- leaderboard.test.ts
# 4 tests verts : format semaine, ISO edge cases.
```
