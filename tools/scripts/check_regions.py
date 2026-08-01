#!/usr/bin/env python3
"""
check_regions.py — cohérence multi-régions (Phase 20.1).

Verrous :
  * REGIONS (backend/src/common/regions/regions.ts) = allow-list
    {alger, oran, constantine} — JAMAIS de région hors Algérie (18-07) ;
  * exactement un primary ;
  * chaque région a son overlay kustomize : namespace medanki-<id>,
    base ../../prod, env MEDANKI_REGION=<id>, rôle cohérent ;
  * aucune valeur type secret dans les overlays (les secrets restent
    dans overlays/prod/secrets, chiffrés — jamais de copie régionale).

Usage : python3 tools/scripts/check_regions.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGIONS_TS = ROOT / "backend" / "src" / "common" / "regions" / "regions.ts"
OVERLAYS = ROOT / "deploy" / "k8s" / "overlays" / "regions"

ALLOWED_REGIONS = {"alger", "oran", "constantine"}
SECRET_HINTS = re.compile(
    r"(password|secret|api[_-]?key|token)\s*[:=]\s*['\"]?[^\s'\"]{6,}", re.I)


def main() -> int:
    failures: list[str] = []

    ts = REGIONS_TS.read_text(encoding="utf-8")
    ids = re.findall(r"id:\s*'(\w+)'", ts)
    roles = dict(zip(ids, re.findall(r"role:\s*'(\w+)'", ts)))

    if set(ids) != ALLOWED_REGIONS:
        failures.append(
            f"REGIONS ≠ allow-list DZ : {sorted(ids)} (attendu {sorted(ALLOWED_REGIONS)})")
    primaries = [r for r, role in roles.items() if role == "primary"]
    if len(primaries) != 1:
        failures.append(f"exactement 1 primary attendu, trouvé {primaries}")
    if primaries and primaries[0] != "alger":
        failures.append(f"le primary doit être alger, trouvé {primaries[0]}")
    tz_decls = re.findall(r"timezone:\s*'([^']+)'", ts)
    if tz_decls != ["Africa/Algiers"] * len(ALLOWED_REGIONS):
        failures.append(
            f"chaque région doit déclarer timezone Africa/Algiers : {tz_decls}")

    for region in sorted(ALLOWED_REGIONS):
        k = OVERLAYS / region / "kustomization.yaml"
        if not k.exists():
            failures.append(f"overlay manquant : {k.relative_to(ROOT)}")
            continue
        text = k.read_text(encoding="utf-8")
        if f"namespace: medanki-{region}" not in text:
            failures.append(f"{region} : namespace medanki-{region} absent")
        if "- ../../prod" not in text:
            failures.append(f"{region} : doit référencer la base ../../prod")
        if not re.search(rf"name:\s*MEDANKI_REGION\n\s*value:\s*{region}\b", text):
            failures.append(f"{region} : env MEDANKI_REGION={region} absent")
        expected_role = "primary" if region == "alger" else "replica"
        if f"value: {expected_role}" not in text:
            failures.append(f"{region} : rôle {expected_role} incohérent")
        if SECRET_HINTS.search(text):
            failures.append(f"{region} : valeur suspecte type secret dans l'overlay")
        if "timezone: 'Africa/Algiers'" not in ts:
            pass  # déjà couvert plus haut

    if failures:
        print(f"❌ {len(failures)} problème(s) multi-régions :")
        for f in failures:
            print("  -", f)
        return 1
    print("✅ Multi-régions cohérent (3 régions DZ, 1 primary alger, "
          "overlays complets, aucun secret régional).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
