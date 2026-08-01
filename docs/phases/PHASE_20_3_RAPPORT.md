# Phase 20.3 — ML pipeline : prédiction de score examen blanc + focus par tag

> Statut : **terminée**. Pipeline ML **local et explicable** : pas de
> service externe, pas de donnée envoyée, coefficients versionnés et
> évaluation offline automatisée sur cohorte synthétique.

## Livré

```
backend/src/ml/
  score-predictor.ts   (logistique explicable : 4 features + streak,
     coefficients signés et versionnés SCORE_MODEL_VERSION, bornes
     défensives NaN/hors [0,1], k-anonymat MIN_REVIEWS_30D=50)
  tag-adjustments.ts   (focus ≥35 % échecs ≥20 revues, relax ≤8 %
     ≥40 revues, cap 5 par catégorie, reasons en langage clair)
  ml.service.ts        (agrégation Drizzle : fenêtre 30 j, hors exam
     mode, streak 90 j, tags normalisés comme l'adaptatif 18.4)
  ml.controller.ts     (GET /v1/ml/mock-exam-prediction,
                        GET /v1/ml/tag-focus — JWT, données propres)
  ml.module.ts         (monté dans AppModule)

backend/test/unit/ml_score.test.ts
  (20 cas : déterminisme, monotonie par feature, bandes/seuils,
   k-anonymat, bornes défensives, min-sample, tri, caps, NaN)

tools/ml_eval.py       (cohorte synthétique 4 000 sujets déterministe :
   parité coefficients TS↔Python, MAE 2.93 ≤ 10, séparation 38.7 pts
   ≥ 8 — bloquant dans phase13_checks.sh)
```

## Décisions structurantes

### Explicable par construction (v2 §13)

Régression logistique à **coefficients documentés** (`intercept -1.2`,
accuracy 2.6, coverage 1.1, mature 0.8, logStreak 0.3). La réponse
rend `features` + `modelVersion` + `marginPercent` : un étudiant peut
comprendre POURQUOI son score est prédit à 62 %, et toute évolution de
coefficients est une entrée de changelog + ré-évaluation `ml_eval.py`.

### k-anonymat / signal minimum

Sous 50 revues sur 30 j → refus argumenté
(`predictible: false, reason`), pas de chiffre indéfendable affiché.
Conventions distinctes de l'adaptatif (18.4) documentées : 18.4 agit
sur les **poids FSRS**, 20.3 agit sur la **prédiction affichée** et
les **priorités éditoriales**.

### Vie privée totale

Le modèle consomme des agrégats déjà en base (review_logs ×
srs_card_state × cards.tags), calcul 100 % local. `ml_eval.py` évalue
sur cohorte **synthétique hash-seedée** — reproductible, sans aucune
donnée réelle.

### Garde-fous de régression

| Risque | Verrou |
|---|---|
| coefficients TS modifiés sans réévaluer | parité regex + MAE dans ml_eval (bloquant) |
| score absurde (NaN, >100) | clamps + test bornes |
| prédiction décorrélée des features | séparation low/high mesurée à chaque eval |
| suggestions tag à bruit statistique | MIN_TAG_REVIEWS=20 + tests min-sample |

## Vérification

```bash
python3 tools/ml_eval.py                  # ✓ MAE 2.93, sép 38.7
bash tools/scripts/phase13_checks.sh      # ✓ (ml_eval bloquant)
cd backend && npm run test -- ml_score.test  # vitest (CI)
```

## Hors périmètre (reporté)

* Ré-entraînement sur données réelles anonymisées (pipeline retrain
  avec registre de versions) — nécessite du volume post-lancement.
* Consommation mobile des deux endpoints dans l'écran stats (widgets à
  ajouter au même endroit que HintBanner — endpoints stables).
* Ajustement de la rétention cible FSRS (`requestRetention`) en
  fonction de la bande prédite — expérimentation encadrée Phase 20+.
