"""Génère les scénarios golden FSRS-5 consommés par les tests Dart.

Sortie : mobile/test/srs/golden_scenarios.json

Le fichier produit est la référence contractuelle du moteur. Toute évolution
volontaire des formules impose de le régénérer ET de justifier le diff.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fsrs_reference import (  # noqa: E402
    DAY_MS, DEFAULT_W, State, apply_review, fold, preview,
    retrievability, interval_from_stability, init_difficulty, init_stability,
    compute_fsrs_adjustment,
    AGAIN, HARD, GOOD, EASY,
)

RATING_NAMES = {1: "again", 2: "hard", 3: "good", 4: "easy"}
T0 = 1700000000000  # 2023-11-14T22:13:20Z — instant de référence fixe


def run_sequence(name, steps, card_type="basic", description="", w=None):
    """steps = liste de (rating, jours_ecoules_depuis_la_revue_precedente).

    w : poids FSRS explicites (p. ex. ajustés) — None = poids par défaut."""
    st = State()
    now = T0
    out_steps = []
    for i, (grade, gap_days) in enumerate(steps):
        if i > 0:
            now += int(gap_days * DAY_MS)
        st = apply_review(st, grade, now, card_type=card_type, w=w)
        d = st.to_dict()
        d["rating"] = grade
        d["ratingName"] = RATING_NAMES[grade]
        d["gapDays"] = gap_days
        d["nowMs"] = now
        d["dueMs"] = st.due_ms
        out_steps.append(d)
    return {
        "name": name,
        "description": description,
        "cardType": card_type,
        "t0": T0,
        "steps": out_steps,
    }


def build():
    scenarios = []

    # --- 1. Séquences canoniques d'un seul rating répété -------------------
    for grade, gname in RATING_NAMES.items():
        scenarios.append(run_sequence(
            f"repeat_{gname}",
            [(grade, 0)] + [(grade, 1)] * 5,
            description=f"Six revues consécutives notées {gname}",
        ))

    # --- 2. Parcours d'apprentissage réalistes ------------------------------
    scenarios.append(run_sequence(
        "learn_then_review",
        [(GOOD, 0), (GOOD, 0), (GOOD, 4), (GOOD, 14), (GOOD, 40)],
        description="Apprentissage nominal puis espacement croissant",
    ))
    scenarios.append(run_sequence(
        "lapse_and_recover",
        [(GOOD, 0), (GOOD, 0), (GOOD, 4), (AGAIN, 14), (GOOD, 0), (GOOD, 3)],
        description="Oubli en révision puis ré-apprentissage",
    ))
    scenarios.append(run_sequence(
        "hard_struggler",
        [(HARD, 0), (HARD, 0), (HARD, 2), (HARD, 3), (HARD, 4)],
        description="Étudiant qui peine : la difficulté doit monter",
    ))
    scenarios.append(run_sequence(
        "easy_fast_track",
        [(EASY, 0), (EASY, 20), (EASY, 90)],
        description="Carte déjà connue : sortie immédiate de l'apprentissage",
    ))
    scenarios.append(run_sequence(
        "mixed_realistic",
        [(GOOD, 0), (HARD, 0), (GOOD, 2), (EASY, 6), (AGAIN, 30),
         (GOOD, 0), (GOOD, 2), (GOOD, 7)],
        description="Parcours mixte représentatif",
    ))
    scenarios.append(run_sequence(
        "again_then_good_new",
        [(AGAIN, 0), (GOOD, 0), (GOOD, 1), (GOOD, 5)],
        description="Échec à la première vue puis progression",
    ))
    scenarios.append(run_sequence(
        "same_day_reviews",
        [(GOOD, 0), (GOOD, 0), (GOOD, 0), (GOOD, 0)],
        description="Quatre revues le même jour (stabilité court terme)",
    ))
    scenarios.append(run_sequence(
        "long_gap_overdue",
        [(GOOD, 0), (GOOD, 0), (GOOD, 4), (GOOD, 200)],
        description="Révision très en retard : R faible, gros gain de stabilité",
    ))
    scenarios.append(run_sequence(
        "leech_card",
        [(GOOD, 0), (GOOD, 0)] + [(AGAIN, 3), (GOOD, 0)] * 8,
        description="Huit lapses : la carte doit être marquée leech",
    ))

    # --- 3. QCM vs BASIC : même séquence, pondération différente ------------
    seq = [(GOOD, 0), (GOOD, 0), (GOOD, 4), (GOOD, 12), (GOOD, 30)]
    scenarios.append(run_sequence("qcm_weighted", seq, card_type="qcm",
                                  description="QCM : gain de stabilité tempéré à 0.85"))
    scenarios.append(run_sequence("basic_baseline", seq, card_type="basic",
                                  description="Même séquence en BASIC (référence)"))

    # --- 4. Toutes les transitions depuis chaque état -----------------------
    bases = {
        "from_new": [],
        "from_learning": [(GOOD, 0)],
        "from_review": [(GOOD, 0), (GOOD, 0), (GOOD, 5)],
        "from_relearning": [(GOOD, 0), (GOOD, 0), (GOOD, 5), (AGAIN, 10)],
    }
    for bname, prefix in bases.items():
        for grade, gname in RATING_NAMES.items():
            scenarios.append(run_sequence(
                f"{bname}_rate_{gname}",
                prefix + [(grade, 1 if prefix else 0)],
                description=f"Transition {bname} + {gname}",
            ))

    # --- 5. Aperçus des 4 boutons -------------------------------------------
    previews = []
    preview_bases = {
        "new": [],
        "learning": [(GOOD, 0)],
        "young_review": [(GOOD, 0), (GOOD, 0)],
        "mature_review": [(GOOD, 0), (GOOD, 0), (GOOD, 4), (GOOD, 15), (GOOD, 45)],
    }
    for pname, steps in preview_bases.items():
        st = State()
        now = T0
        for i, (grade, gap) in enumerate(steps):
            if i > 0:
                now += int(gap * DAY_MS)
            st = apply_review(st, grade, now)
        probe = now + DAY_MS * (st.scheduled_days if st.scheduled_days else 0)
        previews.append({
            "name": pname,
            "buildSteps": [{"rating": g, "gapDays": gp} for g, gp in steps],
            "probeMs": probe,
            "intervals": {RATING_NAMES[g]: v for g, v in
                          preview(st, probe).items()},
        })

    # --- 6. Primitives mathématiques ----------------------------------------
    math_probes = {
        "retrievability": [
            {"elapsedDays": t, "stability": s,
             "expected": retrievability(t, s)}
            for s in (1.0, 5.0, 20.0, 100.0)
            for t in (0.0, 1.0, 5.0, 20.0, 100.0)
        ],
        "intervalFromStability": [
            {"stability": s, "requestRetention": r,
             "expected": interval_from_stability(s, r)}
            for s in (1.0, 3.173, 10.0, 50.0, 365.0)
            for r in (0.8, 0.9, 0.95)
        ],
        "initialStability": [
            {"rating": g, "expected": init_stability(DEFAULT_W, g)}
            for g in (1, 2, 3, 4)
        ],
        "initialDifficulty": [
            {"rating": g, "expected": init_difficulty(DEFAULT_W, g)}
            for g in (1, 2, 3, 4)
        ],
    }

    # --- 7. Fold : déterminisme et exclusion du mode examen -----------------
    events = []
    for i, (grade, day) in enumerate([(3, 0), (3, 0), (3, 4), (1, 18), (3, 18), (3, 22)]):
        events.append({
            "id": f"{i:08d}-0000-7000-8000-000000000000",
            "rating": grade,
            "reviewedAt": T0 + day * DAY_MS + i * 1000,
            "cardType": "basic",
            "examMode": False,
        })
    exam_event = {
        "id": "99999999-0000-7000-8000-000000000000",
        "rating": 1,
        "reviewedAt": T0 + 10 * DAY_MS,
        "cardType": "qcm",
        "examMode": True,
    }
    fold_case = {
        "events": events,
        "examEvent": exam_event,
        "expected": fold(events).to_dict(),
        "expectedWithExam": fold(events + [exam_event]).to_dict(),
    }

    # --- 8. FSRS adaptatif (Phase 19.6) -------------------------------------
    #
    # a) Cas de calcul d'ajustement : (totalReviews, lapseRate) → poids.
    #    Le moteur Dart doit produire EXACTEMENT ces poids via
    #    FsrsAdaptive.computeAdjustment (miroir du backend 18.4).
    adjustment_cases = []
    for case_name, total_reviews, lapse_rate in [
        ("below_min_reviews_no_change", 99, 0.5),
        ("exactly_min_reviews_fragile", 100, 0.5),
        ("fragile_adjusts_w11", 350, 0.42),
        ("fragile_edge_30pct", 150, 0.3),
        ("strong_needs_200_reviews", 150, 0.02),
        ("strong_adjusts_w8", 400, 0.01),
        ("strong_edge_5pct_200", 200, 0.05),
        ("neutral_band_no_change", 500, 0.15),
    ]:
        adj_w, changed, reasons = compute_fsrs_adjustment(total_reviews, lapse_rate)
        adjustment_cases.append({
            "name": case_name,
            "totalReviews": total_reviews,
            "lapseRate": lapse_rate,
            "expectedChangedIndices": changed,
            "expectedWeights": adj_w,
            "expectedReasons": reasons,
        })

    # b) Séquences complètes rejouées avec les poids ajustés — les golden
    #    verrouillent l'effet de w11×1.15 (oubli) et w8×1.05 (rappel) sur
    #    TOUT le parcours, pas seulement sur les primitives.
    fragile_w, _, _ = compute_fsrs_adjustment(300, 0.4)
    strong_w, _, _ = compute_fsrs_adjustment(400, 0.02)
    adaptive_scenarios = [
        run_sequence(
            "adaptive_fragile_lapse_recovery",
            [(GOOD, 0), (GOOD, 0), (GOOD, 4), (AGAIN, 14), (GOOD, 0), (GOOD, 3)],
            w=fragile_w,
            description="Profil fragile (w11 ×1.15) : la stabilité post-oubli "
                        "se reconstruit plus vite",
        ),
        run_sequence(
            "adaptive_strong_spacing",
            [(GOOD, 0), (GOOD, 0), (GOOD, 4), (GOOD, 12), (EASY, 30)],
            w=strong_w,
            description="Profil fort (w8 ×1.05) : les rappels réussis espacent "
                        "un peu plus",
        ),
    ]

    return {
        "_comment": "Généré par tools/generate_golden.py — NE PAS ÉDITER À LA MAIN.",
        "t0": T0,
        "weights": DEFAULT_W,
        "scenarios": scenarios,
        "previews": previews,
        "math": math_probes,
        "fold": fold_case,
        "adaptive": {
            "adjustmentCases": adjustment_cases,
            "scenarios": adaptive_scenarios,
        },
    }


if __name__ == "__main__":
    data = build()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "..", "mobile", "test", "srs", "golden_scenarios.json")
    out = os.path.normpath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    n_steps = sum(len(s["steps"]) for s in data["scenarios"])
    print(f"{len(data['scenarios'])} scénarios, {n_steps} étapes vérifiées")
    print(f"{len(data['previews'])} aperçus, "
          f"{sum(len(v) for v in data['math'].values())} sondes mathématiques")
    print("->", out)
