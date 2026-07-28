"""Équivalence de bout en bout : notre moteur vs le planificateur `ts-fsrs`.

Complète `cross_check.py` (qui compare les primitives) en rejouant des
séquences de révision complètes. On compare les grandeurs qui doivent
impérativement coïncider entre le mobile (Dart) et le backend (TypeScript) :
stabilité, difficulté, reps, lapses et état de la machine à états.

Les *paliers d'apprentissage* (1 min / 6 min / 10 min) sont un choix produit
MedAnki DZ et diffèrent volontairement des valeurs par défaut de ts-fsrs ; les
intervalles en jours ne sont donc comparés qu'une fois la carte en REVIEW.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fsrs_reference import DAY_MS, State, apply_review  # noqa: E402

TOL = 1e-6
T0 = 1700000000000

SEQUENCES = {
    "repeat_good": [(3, 0), (3, 1), (3, 1), (3, 1), (3, 1), (3, 1)],
    "learn_then_review": [(3, 0), (3, 0), (3, 4), (3, 14), (3, 40)],
    "lapse_and_recover": [(3, 0), (3, 0), (3, 4), (1, 14), (3, 0), (3, 3)],
    "hard_struggler": [(2, 0), (2, 0), (2, 2), (2, 3), (2, 4)],
    "easy_fast_track": [(4, 0), (4, 20), (4, 90)],
    "mixed_realistic": [(3, 0), (2, 0), (3, 2), (4, 6), (1, 30), (3, 0), (3, 2), (3, 7)],
    "again_then_good": [(1, 0), (3, 0), (3, 1), (3, 5)],
    "same_day": [(3, 0), (3, 0), (3, 0), (3, 0)],
    "long_overdue": [(3, 0), (3, 0), (3, 4), (3, 200)],
    "all_again": [(1, 0), (1, 1), (1, 1), (1, 1)],
    "alternating": [(3, 0), (1, 2), (3, 0), (1, 3), (4, 5), (2, 8)],
}


def main(path):
    ref = json.load(open(path))
    failures = []
    compared = 0

    for name, steps in SEQUENCES.items():
        if name not in ref:
            failures.append(f"{name}: absent de la référence ts-fsrs")
            continue
        trace = ref[name]
        st = State()
        now = T0
        for i, (grade, gap) in enumerate(steps):
            if i > 0:
                now += gap * DAY_MS
            st = apply_review(st, grade, now)
            exp = trace[i]
            label = f"{name}[{i}] g={grade}"

            for field, ours, theirs in (
                ("stability", st.stability, exp["stability"]),
                ("difficulty", st.difficulty, exp["difficulty"]),
            ):
                compared += 1
                if abs(ours - theirs) > TOL * max(1.0, abs(theirs)):
                    failures.append(
                        f"{label} {field}: nous={ours!r} ts-fsrs={theirs!r} "
                        f"delta={ours - theirs:.3e}")

            for field, ours, theirs in (
                ("reps", st.reps, exp["reps"]),
                ("lapses", st.lapses, exp["lapses"]),
                ("state", st.state, exp["state"]),
            ):
                compared += 1
                if ours != theirs:
                    failures.append(
                        f"{label} {field}: nous={ours!r} ts-fsrs={theirs!r}")

    print(f"{compared} grandeurs comparées sur {len(SEQUENCES)} séquences")
    if failures:
        print(f"\n❌ {len(failures)} DIVERGENCE(S) :\n")
        for f in failures[:40]:
            print("  -", f)
        if len(failures) > 40:
            print(f"  ... et {len(failures) - 40} autres")
        return 1
    print("✅ Séquences complètes identiques au planificateur officiel FSRS-5.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/tsseq.json"))
