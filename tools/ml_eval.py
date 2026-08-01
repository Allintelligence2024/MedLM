#!/usr/bin/env python3
"""
ml_eval.py — évaluation OFFLINE du prédicteur de score (Phase 20.3).

Trois garanties sur une cohorte SYNTHÉTIQUE déterministe (aucune donnée
réelle — le modèle ne quitte jamais le serveur) :

  1. PARITÉ : les coefficients lus dans score-predictor.ts (regex) sont
     ceux du miroir Python ci-dessous — un oubli de synchro casse ici ;
  2. CALIBRATION : l'erreur absolue moyenne entre score prédit et score
     « vrai » simulé reste ≤ MAE_MAX (10 points) ;
  3. SÉPARATION : la bande 'high' a un vrai score moyen supérieur à la
     bande 'low' (discrimination minimale) — sinon la prédiction est
     décorrélée des features.

Schéma génératif (documenté) : le vrai score est une logistique des
mêmes features, avec coefficients vrais proches des coefficients du
modèle ± bruit, représentant la réalité que le modèle approche.

Usage : python3 tools/ml_eval.py
"""
from __future__ import annotations

import math
import re
import sys
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS_FILE = ROOT / "backend" / "src" / "ml" / "score-predictor.ts"

MAE_MAX = 10.0  # points de pourcentage
MIN_SEPARATION = 8.0  # points entre bandes high/low
N_COHORT = 4_000


def extract_ts_coefficients() -> dict[str, float]:
    src = TS_FILE.read_text(encoding="utf-8")
    block = re.search(r"SCORE_COEFFICIENTS\s*=\s*\{(.*?)\} as const", src, re.S)
    if not block:
        raise SystemExit("SCORE_COEFFICIENTS introuvable dans score-predictor.ts")
    pairs = re.findall(r"(\w+):\s*(-?\d+(?:\.\d+)?)", block.group(1))
    return {k: float(v) for k, v in pairs}


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def predict(c: dict[str, float], f: dict[str, float]) -> float:
    """Miroir Python du modèle TS (mêmes noms de coefficients)."""
    z = (
        c["intercept"]
        + c["accuracy30d"] * f["accuracy30d"]
        + c["coverageRatio"] * f["coverageRatio"]
        + c["matureRatio"] * f["matureRatio"]
        + c["logStreak"] * math.log1p(min(f["streakDays"], 30))
    )
    return sigmoid(z) * 100.0


def noise01(seed: str) -> float:
    """Float déterministe dans [0,1) depuis une graine (pas de RNG non
    seedé — reproductible à l'identique)."""
    h = hashlib.sha256(seed.encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def synth_cohort(n: int) -> list[dict[str, float]]:
    cohort = []
    for i in range(n):
        f = {
            "accuracy30d": noise01(f"acc-{i}"),
            "coverageRatio": noise01(f"cov-{i}"),
            "matureRatio": noise01(f"mat-{i}"),
            "streakDays": int(noise01(f"stk-{i}") * 30),
        }
        cohort.append(f)
    return cohort


# Vrais coefficients (réalité simulée) : modèle ± dérive raisonnable.
TRUE_COEFFICIENTS = {
    "intercept": -1.35,
    "accuracy30d": 2.45,
    "coverageRatio": 1.25,
    "matureRatio": 0.75,
    "logStreak": 0.28,
}


def main() -> int:
    failures: list[str] = []

    # 1. Parité coefficients.
    ts_c = extract_ts_coefficients()
    expected_keys = {"intercept", "accuracy30d", "coverageRatio",
                     "matureRatio", "logStreak"}
    if set(ts_c) != expected_keys:
        failures.append(f"clés coefficients TS ≠ attendues : {sorted(ts_c)}")
    model_c = {k: ts_c.get(k, 0.0) for k in expected_keys}

    # 2 + 3. Calibration & séparation sur cohorte synthétique.
    cohort = synth_cohort(N_COHORT)
    preds = [predict(model_c, f) for f in cohort]
    trues = [predict(TRUE_COEFFICIENTS, f) for f in cohort]

    mae = sum(abs(p - t) for p, t in zip(preds, trues)) / len(preds)
    if mae > MAE_MAX:
        failures.append(f"MAE {mae:.2f} > {MAE_MAX} (calibration dégradée)")

    def band(p: float) -> str:
        return "low" if p < 55 else ("medium" if p < 70 else "high")

    by_band: dict[str, list[float]] = {"low": [], "medium": [], "high": []}
    for p, t in zip(preds, trues):
        by_band[band(p)].append(t)
    means = {b: (sum(v) / len(v) if v else None) for b, v in by_band.items()}
    if all(means[b] is not None for b in ("low", "high")):
        separation = means["high"] - means["low"]  # type: ignore[operator]
        if separation < MIN_SEPARATION:
            failures.append(
                f"séparation low→high {separation:.1f} < {MIN_SEPARATION}")

    print(f"[ml_eval] cohorte synthétique : {len(cohort)} sujets")
    print(f"[ml_eval] coefficients TS : {model_c}")
    print(f"[ml_eval] MAE={mae:.2f} (max {MAE_MAX})")
    print(f"[ml_eval] vrai score moyen par bande prédite : "
          f"low={means['low'] and round(means['low'], 1)}, "
          f"medium={means['medium'] and round(means['medium'], 1)}, "
          f"high={means['high'] and round(means['high'], 1)}")

    if failures:
        print(f"❌ {len(failures)} problème(s) ml_eval :")
        for f in failures:
            print("  -", f)
        return 1
    print("✅ Prédicteur validé offline (parité, calibration, séparation).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
