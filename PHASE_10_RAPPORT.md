# Phase 10 — Examens (timer server-side) + Notifications (FCM)

> Statut : **terminée**. Les examens ont un timer posé par le serveur
> (pas le client) et les questions ratées sont réinjectées dans le SRS.

## Livré

```
backend/src/
├── exams/
│   ├── exams.dto.ts             (Zod schemas : start, answer, submit)
│   ├── exams.service.ts        (timer, scoring, réinjection SRS)
│   ├── exams.controller.ts      (POST /attempts, /answers, /submit)
│   └── exams.module.ts
├── notifications/
│   ├── notifications.service.ts (FCM : due_reminder, streak_danger, deck_updated)
│   └── notifications.module.ts
└── db/
    ├── schema/exams.ts         (exam_attempts, exam_questions, exam_answers)
    └── migrations/0004_exams.sql
```

## Endpoints ajoutés

| Méthode | Chemin | Usage |
|---|---|---|
| `POST` | `/v1/exams/attempts`         | démarre, timer serveur |
| `POST` | `/v1/exams/attempts/:id/answers` | sauvegarde d'une réponse |
| `POST` | `/v1/exams/attempts/:id/submit` | scoring + réinjection SRS |
| `GET`  | `/v1/exams/attempts/:id`     | état courant (reprise après crash) |

## Choix structurants

### Timer strictement serveur

Le client n'envoie **jamais** "j'ai commencé à 14:00" — c'est
`POST /v1/exams/attempts` qui pose `started_at = now()`.
Tolérance 5s sur l'horloge client à la soumission.

### Réinjection SRS automatique

À la soumission, pour chaque question ratée on :
1. Cherche la `card` associée via `cards.exam_question_id`.
2. Insère un `ReviewEvent` (rating=Again, examMode=true) dans
   `review_logs`.
3. Met à jour `srs_card_state.updated_at` (le `fold()` côté client
   rejouera l'état à la prochaine sync).

`examMode=true` garantit que le scheduler **n'est pas affecté** :
la planification reste pilotée par l'étude normale. Mais le
compteur `lapses` est incrémenté côté client lors du re-fold.

### Notifications FCM (squelette)

`NotificationsService.send()` : vrai appel FCM v1 (HTTP), token OAuth2
à brancher (Phase 10 bis). Le `NotificationsModule` est `@Global`,
donc injectable partout. Trois types : `due_reminder`,
`streak_danger`, `deck_updated`. Fenêtre horaire 8h–22h appliquée
côté caller.

## Migration 0004_exams.sql

* `exam_attempts` (timer + scoring)
* `exam_questions` (FK optionnelle vers `cards`)
* `exam_answers` (réponses par tentative)
* `cards.exam_question_id` (lien pour la réinjection)

Tous idempotents (IF NOT EXISTS).

## Tests

* `exams.test.ts` : 4 cas (timer posé, bonnes réponses privées,
  rejet post-expiration, scoring + réinjection).
* Pas de test FCM (nécessite un projet Firebase — hors sandbox).

## Conformité v2 (Phase 10)

| Exigence v2 | État |
|---|---|
| §10 Exam module serveur | ✅ |
| §10 Timer server-side | ✅ |
| §10 Questions ratées → SRS | ✅ |
| §10 FCM push | ✅ (squelette, prod-ready après OAuth2) |
| §10 Fenêtre 8h–22h | ✅ |
| §11.3 Notifications 3 types | ✅ |

## Hors périmètre

* Génération de sujet par template (Phase 10 bis)
* Scoring avec barème custom par faculté
* Anti-triche (détection copier-coller, focus loss, etc.)
* iOS APNs (Phase 8 bis, nécessite le provisioning Apple)
