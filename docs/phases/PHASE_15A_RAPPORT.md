# Phase 15.1 — Révisions rapides (Quick Sessions)

> Statut : **terminée**. Les étudiants peuvent désormais lancer
> une session courte de 5 cartes (cap 10) sans démarrer la
> session complète — utile pour les streaks ou les moments courts
> (métro, attente).

## Livré

```
mobile/lib/core/study/
└── quick_session.dart                (QuickSession, QuickSessionConfig, QuickSessionResult)

mobile/test/study/
└── quick_session_test.dart           (6 cas : start, double-start, reviews, finish, durée, pile vide)
```

## Choix structurants

### Pourquoi une sous-classe et pas un simple paramètre

`BuildStudyQueueUseCase` est déjà paramétrable
(`maxReviewsPerSession`). Mais une quick session a des règles
**différentes** d'une session normale :
* Pas de nouvelles cartes (risque de surcharge).
* Plafond **dure** (5 min, hard cap 10 min).
* Rating minimum (>= Hard) pour qu'une carte soit "complétée".
* Pas de bonus XP.

Une classe dédiée explicite ces règles et les rend testables
indépendamment.

### Pas de bonus XP

Cf. v2 §9.1 : on n'encourage pas l'usage de quick session
pour booster la gamification. Sinon, on verrait apparaître
"spam 5 quick sessions par jour" → l'XP artificielle. Les
sessions complètes sont les seules qui créditent le quota
quotidien.

### Pas de nouvelles cartes

Si on autorise les nouvelles cartes en quick session, on
encourage le *preview* superficiel (lire 1 fois, jamais
réviser vraiment). C'est anti-pédagogique.

### Hard cap 10 minutes

Au-delà, ce n'est plus une quick session. Le `QuickSessionResult.completed`
passe à `false` et la session n'est pas comptée comme
"réussie" — mais les revues sont bien enregistrées (on ne perd
pas le travail).

## Conformité v2 (Phase 15.1)

| Exigence v2 | État |
|---|---|
| §14 Boucle d'étude courte | ✅ QuickSession |
| §9.1 Pas de bonus XP pour quick | ✅ pas de hook XP |
| §9.3 Streak ne crédite pas les quick sessions | ✅ explicite |
| §4 Pas de nouvelles en quick | ✅ `newCardsPerDay: 0` |

## Hors périmètre

* UI de lancement rapide (Phase 18 — un bouton "Quick 5" sur
  le dashboard).
* Stats spécifiques aux quick sessions (Phase 15.2 — tableau
  de bord unifié).
* Push notification "5 min de révision ? " (Phase 14 — déjà
  possible via due_reminder).

## Vérification

```bash
cd mobile
flutter pub get
dart test test/study/quick_session_test.dart
# 6 tests verts.
```
