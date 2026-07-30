# Phase 15.3 — Onboarding adaptatif

> Statut : **terminée**. Le flow d'onboarding pose 5 questions
> calibrées (faculté, année, niveau, modules, objectif quotidien)
> et retourne un profil + 3 decks recommandés.

## Livré

```
backend/src/onboarding/
├── onboarding.dto.ts          (OnboardingBody + réponse profil)
├── onboarding.service.ts      (persist, ajuster FSRS, recommander)
├── onboarding.controller.ts   (POST /v1/onboarding)
└── onboarding.module.ts

backend/test/unit/
└── onboarding.test.ts         (10 cas : 3 FSRS + 7 Zod)
```

## Choix structurants

### 5 questions, pas plus

La v2 §14 prône la friction minimale à l'inscription. Au-delà
de 5 questions, on perd ~30 % d'utilisateurs (mesure standard
SaaS). Les 5 questions couvrent l'essentiel :

1. **Faculté** : pour la segmentation (Algérie, Maroc, France).
2. **Année d'étude** : 1..7 (P1, P2, P3, D1, D2, D3, D4).
3. **Niveau d'expérience** : beginner / intermediate / advanced.
4. **Modules d'intérêt** : multi-sélection (max 20).
5. **Objectif quotidien** : 5..50 cartes (mapping vers
   `newCardsPerDay`).

### Pondération FSRS adaptative

`OnboardingService._adjustFsrsWeights(level)` :
* **beginner** : valeurs par défaut (calibrées pour la médiane).
* **intermediate** : `w[17] *= 1.1` (requestRetention augmentée,
  on espace les révisions — l'étudiant retient mieux).
* **advanced** : `w[2..5] *= 0.85` (difficulté perçue diminuée,
  moins de lapses).

C'est **non-destructif** : les 19 poids sont ajustés mais
toujours dans la plage FSRS-5 officielle (pas de dérive). Le
moteur Dart est compatible (mêmes 19 floats, ordre identique).

### Recommandation de decks (top 3)

Filtrage par `module_interests` + tri par `cardCount` DESC
(gros decks d'abord). Pas encore de personnalisation comportementale
(Phase 16) — on reste sur une heuristique simple.

### "next_step" explicite

Le serveur retourne une **prochaine étape** textuelle que le
client affiche à l'utilisateur. C'est plus chaleureux qu'un
JSON froid, et ça réduit le "que faire maintenant ?".

## Conformité v2 (Phase 15.3)

| Exigence v2 | État |
|---|---|
| §14 Friction minimale à l'inscription | ✅ 5 questions |
| §3 Langue FR/EN/AR | ✅ Zod enum |
| §4 FSRS-5 adaptable au profil | ✅ w ajustés |
| §14 Recommandation initiale | ✅ 3 decks top |
| §14 "next step" claire | ✅ |

## Hors périmètre

* Onboarding progressif (questions en contexte, pas en bloc) —
  Phase 18 (UX).
* Pondération dynamique (machine learning sur comportement) —
  Phase 18.
* Multi-step validation (étape par étape avec checkpoint
  serveur) — Phase 18.

## Vérification

```bash
cd backend
npm run test:unit -- onboarding.test.ts
# 10 cas : 3 FSRS + 7 Zod.
```
