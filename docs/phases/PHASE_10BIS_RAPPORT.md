# Phase 10 bis — Examens (génération par template + barème custom + anti-triche)

> Statut : **terminée**. Les examens mock sont générés
> dynamiquement à partir de templates paramétrés, scorés avec
> pondération par question et barème par faculté, et l'anti-triche
> est tracé côté serveur.

## Livré

```
backend/src/db/
├── schema/exam_templates.ts      (templates + events anti-triche)
└── migrations/0006_exam_templates.sql

backend/src/exams/
├── exam_templates.dto.ts         (ListTemplatesQuery, CheatEventBody, WeightedScoring)
├── exam_templates.service.ts     (generate, listTemplates, recordCheatEvent, suspicionScore)
├── scoring.service.ts            (computeForAttempt avec weights)
└── exams.controller.ts           (4 nouveaux endpoints)
└── exams.module.ts               (+ 2 providers)

mobile/lib/core/anticheat/
└── exam_anticheat.dart           (AntiCheatController + AntiCheatScope widget)

mobile/lib/data/network/
└── api_client.dart               (+3 endpoints : templates, generate, events)

backend/test/unit/
└── exam_templates.test.ts        (2 cas : pas de questions, weights)
```

## Choix structurants

### Templates paramétrés (v2 §10)

Un `exam_templates` est un modèle qui dit :
* Module ciblé (ou multi-module).
* Faculté + année (pour le barème local).
* Nombre de questions + durée.
* Pondération par question (JSONB flexible).
* Seuil de validation (défaut 0.5 = 50%).

À la génération, on pioche aléatoirement N cartes du module et
on crée les `exam_questions` à la volée. Pas de re-calcul de
shuffle à chaque appel : c'est figé dans l'attempt.

### Scoring pondéré (Phase 10 bis)

`ScoringService.computeForAttempt(...)` calcule :
* `weighted_score` = Σ(correct_i × weight_i) / Σ(weight_i)
* `raw_score` = correct / total (audit)
* `pct` = round(weighted_score × 100)
* `pass` = weighted_score ≥ passThreshold

Une question avec `weight=2.0` compte double. Le barème par
faculté (ex. "Alger P1 = 50% pour valider, Oran P1 = 60%")
tombe dans le `passThreshold` du template.

### Anti-triche (append-only, pas bloquant)

7 types d'événements tracés : `focus_loss`, `focus_gain`,
`paste`, `copy`, `switch_tab`, `right_click`, `screenshot`.
Stockés dans `exam_attempt_events` avec un **trigger
append-only** au niveau PostgreSQL (cf. migration 0006).

`suspicionScore(attemptId)` agrège un score 0..1 :
* focus_loss > 5s : +0.2
* paste : +0.3 par event (cap 0.6)
* switch_tab : +0.1 par event (cap 0.4)
* screenshot : +0.5
* right_click : +0.05 par event (cap 0.2)
* Cap final à 1.0.

Ce score est **informatif**, pas bloquant. La politique de
sanction (avertissement, invalidation, ban) sera définie par
le staff pédagogique.

### Côté mobile : `AntiCheatScope`

Widget Flutter qui wrappe l'écran d'examen et :
* Écoute `WidgetsBindingObserver` (focus / background).
* Capture les Ctrl+C / Ctrl+V via `Shortcuts` + `Actions`.
* Envoie chaque event via `ApiClient.recordExamEvent(...)`.

**Pas de blocage** : si le log échoue (réseau down), on catch
en silence. L'anti-triche est un signal, pas un mur.

## Conformité v2 (Phase 10 bis)

| Exigence v2 | État |
|---|---|
| §10 Génération par filtres (module, année, nb) | ✅ |
| §10 Barème pondéré par faculté | ✅ `passThreshold` + `weights` |
| §10 Timer server-side (déjà P10) | ✅ |
| §10 Réinjection SRS questions ratées | ✅ (déjà P10) |
| §10 Anti-triche (focus loss, paste...) | ✅ (7 events) |
| §13 Audit log événements | ✅ `exam_attempt_events` append-only |

## Hors périmètre

* i18n des messages d'erreur.
* Blocage actif en cas de suspicion élevée (politique métier).
* Détection de multi-device simultané.
* Reconnaissance faciale / caméra.
* Screenshot natif via `Channel` (nécessite du code natif
  Android/iOS — sera ajouté si la v2 §13 l'exige).

## Vérification

```bash
cd backend
npm run test:unit -- exam_templates.test.ts
# 2 tests verts : scoring 0 questions + weights.
```
