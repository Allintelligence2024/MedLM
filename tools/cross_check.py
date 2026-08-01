"""Compare notre implémentation FSRS-5 aux valeurs produites par `ts-fsrs`.

`ts-fsrs` est la bibliothèque officielle retenue pour le backend
(architecture v2, §12). Si le moteur Dart mobile et le moteur TypeScript
serveur divergent, la synchronisation produirait des états différents pour la
même suite d'événements — le bug le plus grave possible dans cette
architecture. Ce script verrouille l'équivalence dès la Phase 1.

Usage :
    cd /tmp/tsf && NODE_PATH=/tmp/tsf/node_modules \\
        node tools/verify_against_ts_fsrs.js > /tmp/tsref.json
    python3 tools/cross_check.py /tmp/tsref.json
"""

import json
import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fsrs_reference import (  # noqa: E402
    ADAPTIVE, DEFAULT_W, init_difficulty, init_stability, next_difficulty,
    next_forget_stability, next_recall_stability, next_short_term_stability,
    retrievability,
)

TOL = 1e-8


def main(path):
    ref = json.load(open(path))
    failures = []
    checks = 0

    def cmp(label, ours, theirs):
        nonlocal checks
        checks += 1
        if theirs is None or (isinstance(theirs, float) and math.isnan(theirs)):
            return
        if abs(ours - theirs) > TOL * max(1.0, abs(theirs)):
            failures.append(f"{label}: nous={ours!r} ts-fsrs={theirs!r} "
                            f"delta={ours - theirs:.3e}")

    # Poids
    for i, (a, b) in enumerate(zip(DEFAULT_W, ref["weights"])):
        cmp(f"w[{i}]", a, b)

    # Stabilité / difficulté initiales
    for g in range(1, 5):
        cmp(f"init_stability({g})", init_stability(DEFAULT_W, g),
            ref["initStability"][str(g)])
        cmp(f"init_difficulty({g})", init_difficulty(DEFAULT_W, g),
            ref["initDifficulty"][str(g)])

    # Difficulté suivante
    nd = ref["nextDifficulty"]
    nd_items = nd.items() if isinstance(nd, dict) else enumerate(nd)
    for g, table in nd_items:
        if not table:
            continue
        for d_str, expected in table.items():
            d = float(d_str)
            cmp(f"next_difficulty(d={d}, g={g})",
                next_difficulty(DEFAULT_W, d, int(g)), expected)

    # Courbe d'oubli
    for c in ref["retrievability"]:
        cmp(f"R(t={c['t']}, S={c['S']})",
            retrievability(c["t"], c["S"]), c["value"])

    # Stabilité après rappel
    for c in ref["nextRecallStability"]:
        cmp(f"S_recall(d={c['d']}, s={c['s']}, r={c['r']}, g={c['g']})",
            next_recall_stability(DEFAULT_W, c["d"], c["s"], c["r"], c["g"]),
            c["value"])

    # Stabilité après oubli
    for c in ref["nextForgetStability"]:
        cmp(f"S_forget(d={c['d']}, s={c['s']}, r={c['r']})",
            next_forget_stability(DEFAULT_W, c["d"], c["s"], c["r"]),
            c["value"])

    # Stabilité court terme
    for c in ref["nextShortTermStability"]:
        cmp(f"S_short(s={c['s']}, g={c['g']})",
            next_short_term_stability(DEFAULT_W, c["s"], c["g"]),
            c["value"])

    # Primitives avec poids ADAPTATIFS (Phase 19.6) — section émise par
    # verify_against_ts_fsrs.js. Si absente (vieux tsref.json), on saute.
    adaptive_ref = ref.get("adaptive") or {}
    for label, section in adaptive_ref.items():
        aw = [float(x) for x in section["weights"]]
        # Vérifie d'abord que les poids servis sont bien ceux de
        # l'ajustement attendu (×1.15 w11 fragile / ×1.05 w8 fort).
        expected_w = list(DEFAULT_W)
        if "fragile" in label:
            expected_w[11] *= ADAPTIVE["FRAGILE_W11_FACTOR"]
        elif "strong" in label:
            expected_w[8] *= ADAPTIVE["STRONG_W8_FACTOR"]
        for i, (a, b) in enumerate(zip(expected_w, aw)):
            cmp(f"{label}.w[{i}]", a, b)
        for c in section["nextRecallStability"]:
            cmp(f"{label}.S_recall(d={c['d']}, s={c['s']}, r={c['r']}, g={c['g']})",
                next_recall_stability(aw, c["d"], c["s"], c["r"], c["g"]),
                c["value"])
        for c in section["nextForgetStability"]:
            cmp(f"{label}.S_forget(d={c['d']}, s={c['s']}, r={c['r']})",
                next_forget_stability(aw, c["d"], c["s"], c["r"]),
                c["value"])

    print(f"{checks} valeurs comparées à ts-fsrs {'':<10}")
    if failures:
        print(f"\n❌ {len(failures)} DIVERGENCE(S) :\n")
        for f in failures[:40]:
            print("  -", f)
        if len(failures) > 40:
            print(f"  ... et {len(failures) - 40} autres")
        return 1
    print("✅ Équivalence totale avec l'implémentation officielle FSRS-5.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/tsref.json"))
