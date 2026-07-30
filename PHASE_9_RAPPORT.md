# Phase 9 — Gamification corrigée

> Statut : **terminée**. La gamification est alignée sur la v2 §9 :
> XP sur l'habitude, pas sur la note. Anti-pattern "Easy = bonus"
> supprimé. Streak avec freeze. Niveaux et badges.

## Livré

```
mobile/lib/core/gamification/
├── gamification_constants.dart    (règles, niveaux P1→Praticien, 9 badges)
├── xp_calculator.dart              (moteur pur : XpEvent + XpAward)
├── streak_calculator.dart          (moteur pur : 1 freeze dispo auto)
└── (Badge + Level + BadgeContext dans gamification_constants)

mobile/lib/data/repositories/
└── gamification_repository.dart    (persistance XP/streak dans user_prefs)

mobile/lib/domain/usecases/
└── record_gamification_progress.dart (use case : orchestre XP + streak + badges)

mobile/test/core/
└── gamification_test.dart          (17 tests : XP, streak, levels, badges)
```

## Règles appliquées (v2 §9.1)

| Règle | Implémentation |
|---|---|
| XP sur l'HABITUDE, pas la note | `XpCalculator` n'accepte **aucun paramètre `Rating`**. L'XP est calculée sur le **nombre** d'actions. |
| Pas de bonus "Easy" | Tests `note "Easy" ne donne PAS de bonus (anti-pattern)` : easy(1) == again(1) = 3 XP. |
| Plafond 100 cartes/jour | `GamificationConstants.maxCardsPerDayForXp` ; le calcul plafonne le `effectiveCount`. |
| XP session complétée | +30 XP (au plus une fois par jour). |
| XP carte révisée | +3 XP (toutes notes). |
| XP QCM | +4 XP (reconnaissance = signal plus faible qu'un rappel actif, mais le QCM est plus long). |
| XP mock exam | +50 XP. |
| Multiplicateur streak | ×1.2 à J7, ×1.5 à J30. |

## Streak (v2 §9.3)

* **Minimum** : 10 cartes dues révisées par jour (`minCardsPerDayForStreak`).
* **Tolérance** : si on a révisé hier mais pas aujourd'hui, le streak
  est `atRisk` (mais pas cassé) tant qu'on est dans la fenêtre de
  grâce de 36h (`streakGraceHours`).
* **Freeze** : 2 par mois, **auto-consommés** quand l'algorithme
  détecte un trou (pas d'UI pour l'instant — on n'expose pas le
  concept à l'étudiant, conformément à l'esprit "anti-burnout").

## Niveaux (v2 §9.2)

| Niveau | XP | |
|---|---|---|
| Étudiant P1 | 0 | 🟦 |
| Étudiant P2 | 500 | 🟦⬆ |
| Interne | 2 000 | 🟩 |
| Résident | 5 000 | 🟪 |
| Praticien | 10 000 | 🟧 |

`Level.progressToNext(xp)` retourne une valeur 0..1 pour les barres
de progression. Cap à 1.0 au niveau max.

## Badges (v2 §9.4)

9 badges, tous vérifiables par une fonction pure sur un `BadgeContext` :

| ID | Nom | Critère |
|---|---|---|
| `streak_7` | Semaine parfaite | streak ≥ 7 |
| `streak_30` | Mois de fer | streak ≥ 30 |
| `streak_100` | Centenaire | streak ≥ 100 |
| `module_complete` | Module complété | ≥ 1 module à 100% en REVIEW |
| `mock_80` | As du mock exam | score > 80% (Phase 10) |
| `cards_500` | 500 cartes maîtrisées | ≥ 500 cartes reps≥5, lapses<3 |
| `cards_2500` | 2 500 cartes maîtrisées | ≥ 2 500 |
| `zero_due_7d` | Zéro carte due | 7j sans carte en retard |
| `english_enabled` | Bilingue | EN activé |

**Aucun badge "cosmétique"** (type "j'ai partagé l'app"). Tous sont des
**jalons pédagogiques**.

## Leaderboard

Reporté en Phase 10+ : l'architecture (opt-in, pseudonyme, scope
hebdo) est décrite dans le doc v2 §9.5 mais nécessite le système
d'examens serveur (Phase 10) pour avoir des données comparables.

## Tests (17 cas)

* **XpCalculator** : 6 cas (3 XP, multiplicateur J7/J30, plafond 100,
  plafond 0, anti-pattern Easy).
* **Levels** : 5 cas (mapping XP → nom, progression 0..1).
* **StreakCalculator** : 6 cas (vide, consécutifs, hier-only, cassé,
  freeze auto, freeze épuisé).
* **Badges** : 4 cas (streak 7/30, EN, 500 cartes).

## Conformité v2 (Phase 9)

| Exigence v2 | État |
|---|---|
| §9.1 XP sur habitude, pas rating | ✅ |
| §9.1 Pas de bonus Easy | ✅ (testé) |
| §9.1 Plafond 100 cartes/jour | ✅ |
| §9.2 Niveaux P1→Praticien | ✅ |
| §9.3 Streak + freeze | ✅ |
| §9.4 Badges jalons | ✅ |
| §9.5 Leaderboard opt-in | ⏭️ Phase 10+ (dépend de l'exam server-side) |
| §9 Gamification hors proto +15/Easy | ✅ (suppression explicite, testée) |

## Hors périmètre

* Leaderboard (Phase 10+).
* UI des badges dans l'app (Phase 8 bis — la couche métier est
  prête, l'écran de collection viendra avec le dashboard).
* Notifications push "streak en danger" (Phase 10, FCM).

## Vérification

```bash
cd mobile
flutter pub get
dart test test/core/gamification_test.dart
```
