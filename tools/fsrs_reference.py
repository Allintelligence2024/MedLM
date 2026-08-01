"""
Implémentation de référence FSRS-5 (Python) — MIROIR LIGNE À LIGNE du Dart.

But : le sandbox n'a pas de SDK Dart. On implémente ici exactement les mêmes
formules que `mobile/lib/core/srs/fsrs_engine.dart`, on les exécute, et on
exporte les valeurs obtenues comme "golden values" dans les tests Dart.

Toute divergence Dart/Python sur un scénario = bug à corriger.
Source des formules : FSRS-5 (open-spaced-repetition), aligné sur ts-fsrs.
"""

import math
import json

# --- Constantes FSRS-5 -------------------------------------------------------

DEFAULT_W = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
    2.9898, 0.51655, 0.6621,
]

DECAY = -0.5
FACTOR = 0.9 ** (1.0 / DECAY) - 1.0   # = 19/81
S_MIN = 0.01
S_MAX = 36500.0
D_MIN = 1.0
D_MAX = 10.0

AGAIN, HARD, GOOD, EASY = 1, 2, 3, 4

# Pondération QCM : la reconnaissance est un signal plus faible que le rappel.
QCM_WEIGHT = 0.85


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def retrievability(elapsed_days, stability):
    """R(t,S) = (1 + FACTOR * t/S)^DECAY"""
    if stability <= 0:
        return 0.0
    t = max(0.0, elapsed_days)
    return (1.0 + FACTOR * t / stability) ** DECAY


def interval_from_stability(stability, request_retention=0.9):
    """I = S/FACTOR * (r^(1/DECAY) - 1)"""
    return (stability / FACTOR) * (request_retention ** (1.0 / DECAY) - 1.0)


def init_stability(w, grade):
    return clamp(w[grade - 1], S_MIN, S_MAX)


def init_difficulty(w, grade):
    return clamp(w[4] - math.exp(w[5] * (grade - 1)) + 1.0, D_MIN, D_MAX)


def linear_damping(delta_d, difficulty):
    return delta_d * (10.0 - difficulty) / 9.0


def mean_reversion(w, init, current):
    return w[7] * init + (1.0 - w[7]) * current


def next_difficulty(w, difficulty, grade):
    delta_d = -w[6] * (grade - 3)
    d_damped = difficulty + linear_damping(delta_d, difficulty)
    return clamp(mean_reversion(w, init_difficulty(w, EASY), d_damped), D_MIN, D_MAX)


def next_recall_stability(w, d, s, r, grade):
    hard_penalty = w[15] if grade == HARD else 1.0
    easy_bonus = w[16] if grade == EASY else 1.0
    return clamp(
        s * (1.0
             + math.exp(w[8])
             * (11.0 - d)
             * (s ** -w[9])
             * (math.exp((1.0 - r) * w[10]) - 1.0)
             * hard_penalty
             * easy_bonus),
        S_MIN, S_MAX,
    )


def next_forget_stability(w, d, s, r):
    """Primitive FSRS-5 : stabilité après oubli, SANS borne court terme.

    Le découpage est volontairement identique à `ts-fsrs` : la borne
    `s / exp(w17*w18)` est appliquée par l'appelant (voir `apply_review`), pas
    ici. Cela permet de comparer les primitives une à une entre les deux
    implémentations (cf. tools/cross_check.py).
    """
    s_after_fail = (w[11]
                    * (d ** -w[12])
                    * (((s + 1.0) ** w[13]) - 1.0)
                    * math.exp((1.0 - r) * w[14]))
    return clamp(s_after_fail, S_MIN, S_MAX)


def forget_stability_clamped(w, d, s, r):
    """Stabilité post-oubli telle qu'utilisée par le planificateur.

    Équivalent de ts-fsrs : `clamp(s/exp(w17*w18), S_MIN, next_forget_stability)`
    — autrement dit on ne laisse jamais un oubli produire une stabilité
    supérieure à ce que la décroissance court terme autorise.
    """
    s_short = s / math.exp(w[17] * w[18])
    upper = next_forget_stability(w, d, s, r)
    return clamp(s_short, S_MIN, upper)


def next_short_term_stability(w, s, grade):
    """Révision le même jour (FSRS-5)."""
    return clamp(s * math.exp(w[17] * (grade - 3 + w[18])), S_MIN, S_MAX)


# --- États -------------------------------------------------------------------

NEW, LEARNING, REVIEW, RELEARNING = "new", "learning", "review", "relearning"


class State:
    def __init__(self, state=NEW, stability=0.0, difficulty=0.0, elapsed_days=0,
                 scheduled_days=0, reps=0, lapses=0, last_review_ms=None,
                 due_ms=None, is_leech=False):
        self.state = state
        self.stability = stability
        self.difficulty = difficulty
        self.elapsed_days = elapsed_days
        self.scheduled_days = scheduled_days
        self.reps = reps
        self.lapses = lapses
        self.last_review_ms = last_review_ms
        self.due_ms = due_ms
        self.is_leech = is_leech

    def to_dict(self):
        return {
            "state": self.state,
            "stability": round(self.stability, 8),
            "difficulty": round(self.difficulty, 8),
            "elapsedDays": self.elapsed_days,
            "scheduledDays": self.scheduled_days,
            "reps": self.reps,
            "lapses": self.lapses,
            "isLeech": self.is_leech,
        }


DAY_MS = 86400000
LEECH_THRESHOLD = 8

# Learning steps en minutes (LEARNING: 1min -> 10min, RELEARNING: 10min)
LEARNING_STEPS_MIN = [1.0, 10.0]
RELEARNING_STEPS_MIN = [10.0]


def apply_review(state, grade, now_ms, card_type="basic", request_retention=0.9,
                 w=None, maximum_interval=36500):
    """Applique une revue et retourne le nouvel état. Fonction pure."""
    w = w or DEFAULT_W

    if state.last_review_ms is None:
        elapsed_days = 0
    else:
        elapsed_days = max(0, (now_ms - state.last_review_ms) // DAY_MS)

    new = State(
        state=state.state, stability=state.stability, difficulty=state.difficulty,
        elapsed_days=elapsed_days, scheduled_days=state.scheduled_days,
        reps=state.reps + 1, lapses=state.lapses,
        last_review_ms=now_ms, due_ms=state.due_ms, is_leech=state.is_leech,
    )

    if state.state == NEW:
        new.difficulty = init_difficulty(w, grade)
        new.stability = init_stability(w, grade)
        if grade == AGAIN:
            new.state = LEARNING
            new.scheduled_days = 0
            new.due_ms = now_ms + int(LEARNING_STEPS_MIN[0] * 60000)
        elif grade == HARD:
            new.state = LEARNING
            new.scheduled_days = 0
            new.due_ms = now_ms + int(6 * 60000)
        elif grade == GOOD:
            new.state = LEARNING
            new.scheduled_days = 0
            new.due_ms = now_ms + int(LEARNING_STEPS_MIN[1] * 60000)
        else:  # EASY -> saute directement en REVIEW
            new.state = REVIEW
            ivl = _clamped_interval(new.stability, request_retention, maximum_interval)
            new.scheduled_days = ivl
            new.due_ms = now_ms + ivl * DAY_MS
        return new

    r = retrievability(elapsed_days, state.stability)
    new.difficulty = next_difficulty(w, state.difficulty, grade)


    if state.state in (LEARNING, RELEARNING):
        # Phase d'apprentissage : stabilité court terme
        new.stability = next_short_term_stability(w, state.stability, grade)
        if grade == AGAIN:
            new.state = state.state
            new.due_ms = now_ms + int(LEARNING_STEPS_MIN[0] * 60000)
            new.scheduled_days = 0
        elif grade == HARD:
            new.state = state.state
            new.due_ms = now_ms + int(10 * 60000)
            new.scheduled_days = 0
        else:  # GOOD / EASY -> diplômé en REVIEW
            new.state = REVIEW
            ivl = _clamped_interval(new.stability, request_retention, maximum_interval)
            new.scheduled_days = ivl
            new.due_ms = now_ms + ivl * DAY_MS
        return new

    # state == REVIEW
    #
    # IMPORTANT : la stabilité se calcule avec la difficulté *avant* mise à
    # jour (state.difficulty), comme dans ts-fsrs. Utiliser la nouvelle
    # difficulté introduirait un biais systématique sur tous les intervalles.
    #
    # Une revue le jour même n'est pas un cas particulier : R vaut 1, donc
    # next_recall_stability ne produit aucun gain, ce qui est le comportement
    # voulu (réviser deux fois dans la journée n'apprend rien de plus).
    if grade == AGAIN:
        new.stability = forget_stability_clamped(
            w, state.difficulty, state.stability, r)
    else:
        new.stability = next_recall_stability(
            w, state.difficulty, state.stability, r, grade)

    # Pondération QCM : on tempère le gain de stabilité (reconnaissance < rappel)
    if card_type == "qcm" and grade != AGAIN and new.stability > state.stability:
        gain = new.stability - state.stability
        new.stability = clamp(state.stability + gain * QCM_WEIGHT, S_MIN, S_MAX)

    if grade == AGAIN:
        new.lapses = state.lapses + 1
        new.state = RELEARNING
        new.scheduled_days = 0
        new.due_ms = now_ms + int(RELEARNING_STEPS_MIN[0] * 60000)
        new.is_leech = new.lapses >= LEECH_THRESHOLD
    else:
        new.state = REVIEW
        ivl = _clamped_interval(new.stability, request_retention, maximum_interval)
        new.scheduled_days = ivl
        new.due_ms = now_ms + ivl * DAY_MS
    return new


# --- FSRS adaptatif (Phase 19.6) ------------------------------------------
#
# MIROIR du backend `adaptive.service.ts` (ADAPTIVE_THRESHOLDS) et du moteur
# Dart `fsrs_adaptive.dart`. Les trois fichiers DOIVENT rester alignés.

ADAPTIVE = {
    "ADJUST_MIN_REVIEWS": 100,
    "STRONG_MAX_LAPSE_RATE": 0.05,
    "STRONG_MIN_REVIEWS": 200,
    "FRAGILE_MIN_LAPSE_RATE": 0.3,
    "FRAGILE_W11_FACTOR": 1.15,
    "STRONG_W8_FACTOR": 1.05,
    "WEIGHT_MIN_FACTOR": 0.5,
    "WEIGHT_MAX_FACTOR": 2.0,
}


def clamp_adaptive_weights(weights, base=None):
    """Borne chaque poids dans [0.5×, 2×] de la base (garde-fou v2 §13)."""
    base = base or DEFAULT_W
    return [
        clamp(w, base[i] * ADAPTIVE["WEIGHT_MIN_FACTOR"],
              base[i] * ADAPTIVE["WEIGHT_MAX_FACTOR"])
        for i, w in enumerate(weights)
    ]


def compute_fsrs_adjustment(total_reviews, lapse_rate, w=None):
    """Ajustement personnalisé (conservateur, justifié) — miroir du backend.

    Retourne (poids bornés, indices modifiés, raisons).
    """
    w = w or DEFAULT_W
    weights = list(w)
    changed = []
    reasons = []
    if total_reviews < ADAPTIVE["ADJUST_MIN_REVIEWS"]:
        return weights, changed, reasons
    if lapse_rate >= ADAPTIVE["FRAGILE_MIN_LAPSE_RATE"]:
        weights[11] = w[11] * ADAPTIVE["FRAGILE_W11_FACTOR"]
        changed.append(11)
        reasons.append(
            f"lapse_rate élevé ({round(lapse_rate * 100)}% ≥ 30%) → w11 ×1.15")
    elif (lapse_rate <= ADAPTIVE["STRONG_MAX_LAPSE_RATE"]
          and total_reviews >= ADAPTIVE["STRONG_MIN_REVIEWS"]):
        weights[8] = w[8] * ADAPTIVE["STRONG_W8_FACTOR"]
        changed.append(8)
        reasons.append(
            f"lapse_rate faible ({round(lapse_rate * 100)}% ≤ 5%) → w8 ×1.05")
    return clamp_adaptive_weights(weights, w), changed, reasons


def _round_half_away(x):
    """Dart `roundToDouble()` arrondit la moitié loin de zéro.

    Python `round()` fait un arrondi bancaire : sans cette fonction, Dart et
    Python divergeraient sur les intervalles pile à .5.
    """
    return math.floor(x + 0.5) if x >= 0 else math.ceil(x - 0.5)


def _clamped_interval(stability, request_retention, maximum_interval):
    ivl = interval_from_stability(stability, request_retention)
    return int(clamp(_round_half_away(ivl), 1, maximum_interval))


def preview(state, now_ms, card_type="basic", request_retention=0.9, w=None):
    """Les 4 intervalles affichés sur les boutons Again/Hard/Good/Easy."""
    return {
        g: apply_review(state, g, now_ms, card_type, request_retention, w).scheduled_days
        for g in (AGAIN, HARD, GOOD, EASY)
    }


def fold(events, request_retention=0.9, w=None):
    """srs_state = FSRS.fold(events.filter(!examMode).sortBy(reviewedAt))

    Fonction PURE et DÉTERMINISTE : mêmes events -> même état, quel que soit
    l'ordre d'insertion. C'est la règle d'or de l'architecture v2.
    """
    filtered = [e for e in events if not e.get("examMode", False)]
    filtered.sort(key=lambda e: (e["reviewedAt"], e["id"]))
    st = State()
    for e in filtered:
        st = apply_review(st, e["rating"], e["reviewedAt"],
                          e.get("cardType", "basic"), request_retention, w)
    return st
