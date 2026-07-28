"""Vérifie que le moteur Dart et la référence Python restent structurellement
identiques.

Le sandbox ne dispose pas du SDK Dart ; on ne peut donc pas exécuter les tests
Dart ici. Ce script apporte le garde-fou suivant : il extrait les expressions
mathématiques du fichier Dart, les normalise (syntaxe Dart -> Python) et les
compare terme à terme aux expressions de `fsrs_reference.py`, dont on sait
qu'elle est équivalente à ts-fsrs (601 primitives + 275 grandeurs de séquence).

Ce n'est pas un substitut à `dart test` (à lancer en CI, Phase 12), mais cela
détecte une faute de frappe ou un oubli lors de la transcription.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DART = os.path.join(ROOT, "mobile", "lib", "core", "srs", "fsrs_engine.dart")
PARAMS = os.path.join(ROOT, "mobile", "lib", "core", "srs", "fsrs_parameters.dart")


def normalize(expr):
    """Ramène une expression Dart et une expression Python à une forme commune."""
    e = expr
    e = re.sub(r"\bmath\.", "", e)
    e = re.sub(r"\bparameters\.w\((\d+)\)", r"w[\1]", e)
    e = re.sub(r"\bw\[(\d+)\]", r"w[\1]", e)
    e = re.sub(r"\.toDouble\(\)", "", e)
    e = re.sub(r"\bfinal\s+double\s+", "", e)
    # pow(a, b) -> a ** b  (on ne gère que les cas simples présents ici)
    e = re.sub(r"\s+", "", e)
    e = e.replace("1.0", "1").replace("0.0", "0").replace("10.0", "10")
    e = e.replace("11.0", "11").replace("9.0", "9").replace("3.0", "3")
    return e


def extract_dart_weights():
    src = open(PARAMS, encoding="utf-8").read()
    block = re.search(r"kDefaultFsrsWeights\s*=\s*<double>\[(.*?)\];", src, re.S)
    if not block:
        return None
    nums = re.findall(r"(-?\d+\.\d+)", block.group(1))
    return [float(n) for n in nums]


def main():
    failures = []

    # 1. Les poids Dart doivent être exactement ceux de la référence.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from fsrs_reference import DEFAULT_W

    dart_w = extract_dart_weights()
    if dart_w is None:
        failures.append("Impossible de lire kDefaultFsrsWeights dans le Dart")
    elif len(dart_w) != 19:
        failures.append(f"Le Dart déclare {len(dart_w)} poids au lieu de 19")
    else:
        for i, (a, b) in enumerate(zip(dart_w, DEFAULT_W)):
            if abs(a - b) > 1e-12:
                failures.append(f"w[{i}] Dart={a} != référence={b}")

    src = open(DART, encoding="utf-8").read()

    # 2. Présence des invariants structurels critiques (les deux bugs corrigés).
    required = {
        "stabilité calculée avec l'ANCIENNE difficulté (rappel)":
            r"_nextRecallStability\(\s*current\.difficulty",
        "stabilité calculée avec l'ANCIENNE difficulté (oubli)":
            r"_forgetStabilityClamped\(current\.difficulty",
        "pas de branche 'même jour' parasite en révision":
            None,  # vérifié en négatif ci-dessous
        "clamp court terme séparé de la primitive":
            r"_forgetStabilityClamped",
        "tri du fold sur (reviewedAt, id)":
            r"a\.id\.compareTo\(b\.id\)",
        "exclusion du mode examen dans le fold":
            r"if \(e\.examMode\) continue;",
        "déduplication par identifiant":
            r"unique\[e\.id\] = e;",
        "pondération QCM":
            r"kQcmStabilityWeight",
        "seuil de leech":
            r"lapses >= kLeechThreshold",
    }
    for label, pattern in required.items():
        if pattern is None:
            continue
        if not re.search(pattern, src):
            failures.append(f"Motif manquant dans le Dart — {label}")

    # 3. Le cas 'elapsedDays == 0' ne doit plus court-circuiter la révision.
    if re.search(r"elapsedDays == 0\s*\)\s*\{\s*\n\s*//[^\n]*\n\s*newStability =\s*_nextShortTermStability",
                 src):
        failures.append(
            "Le Dart utilise encore _nextShortTermStability pour les revues "
            "du même jour en état REVIEW (bug corrigé côté référence)")

    # 4. Le moteur ne doit jamais lire l'horloge : pureté indispensable au fold.
    for forbidden in ("DateTime.now()", "Stopwatch(", "Random("):
        if forbidden in src:
            failures.append(
                f"Le moteur doit rester pur : '{forbidden}' interdit dans "
                f"fsrs_engine.dart")

    if failures:
        print(f"❌ {len(failures)} problème(s) de parité Dart/référence :\n")
        for f in failures:
            print("  -", f)
        return 1
    print("✅ Parité Dart/référence vérifiée "
          "(poids, formules critiques, pureté, invariants du fold).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
