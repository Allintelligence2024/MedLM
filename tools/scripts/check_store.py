#!/usr/bin/env python3
"""
check_store.py — vérifie les livrables stores (Phase 19.8).

Garde-fous :
  * fiches Play + Apple présentes dans les 3 langues (fr/ar/en) ;
  * description courte ≤ 80 caractères EFFECTIFS (exigence Play Console) ;
  * aucune promesse médicale interdite dans les fiches (diagnostic,
    guérison…) — un rejet store coûte des semaines ;
  * PRIVACY.md : cadre loi 18-07 + résumés trilingues + engagement
    « jamais de collecte audio / santé » cohérent avec les privacy labels ;
  * RELEASE_CHECKLIST.md : tableau privacy labels présent (cohérence
    console ↔ politique publique).

Usage : python3 tools/scripts/check_store.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

STORE = Path(__file__).resolve().parents[2] / "store"

# Promesses médicales interdites dans une fiche store (revue Apple 1.4.1
# / Play Health Apps) — la formulation doit rester « aide à la révision ».
FORBIDDEN_CLAIMS = [
    re.compile(r"\bdiagnostique\b", re.I),
    re.compile(r"\bdiagnose[sd]?\b", re.I),
    re.compile(r"\bdiagnosis\b", re.I),
    re.compile(r"\bgu[ée]rit\b", re.I),
    re.compile(r"\bcure[sd]?\b", re.I),
    re.compile(r"\btreat(s|ment)?\b", re.I),
    re.compile(r"\bsoigne\b", re.I),
    re.compile(r"يشخ[صّ]"),
    re.compile(r"يعالج"),
    re.compile(r"يشفي"),
]


def short_desc(text: str) -> str | None:
    m = re.search(
        r"(?:SHORT DESCRIPTION \(80\)|DESCRIPTION COURTE \(80\)|الوصف القصير \(80\))\s*:\s*(.+)",
        text,
    )
    return m.group(1).strip() if m else None


def main() -> int:
    failures: list[str] = []

    # 1. Fiches trilingues Play + Apple.
    for store_dir in ("play", "apple"):
        for lang in ("fr", "ar", "en"):
            p = STORE / store_dir / f"listing_{lang}.txt"
            if not p.exists():
                failures.append(f"fiche manquante : {store_dir}/listing_{lang}.txt")
                continue
            text = p.read_text(encoding="utf-8")
            sd = short_desc(text)
            if sd is None:
                failures.append(f"{p.name}: description courte introuvable")
            elif len(sd) > 80:
                failures.append(
                    f"{p.name}: description courte = {len(sd)} caractères (> 80)")
            for pattern in FORBIDDEN_CLAIMS:
                if pattern.search(text):
                    failures.append(
                        f"{p.name}: promesse médicale interdite ({pattern.pattern})")

    # 2. PRIVACY.md.
    privacy = STORE / "PRIVACY.md"
    if not privacy.exists():
        failures.append("PRIVACY.md manquant")
        privacy_text = ""
    else:
        privacy_text = privacy.read_text(encoding="utf-8")
        for needle, label in [
            ("18-07", "cadre loi 18-07"),
            ("## ملخص (AR)", "résumé arabe"),
            ("## Summary (EN)", "résumé anglais"),
            ("ne collectons JAMAIS", "engagement de non-collecte"),
            ("privacy@medanki", "contact délégué vie privée"),
            ("30 jours", "délai de réponse"),
        ]:
            if needle not in privacy_text:
                failures.append(f"PRIVACY.md: {label} absent")

    # 3. Cohérence privacy labels ↔ politique publique.
    checklist = STORE / "RELEASE_CHECKLIST.md"
    if not checklist.exists():
        failures.append("RELEASE_CHECKLIST.md manquant")
    else:
        cl = checklist.read_text(encoding="utf-8")
        for needle, label in [
            ("Data safety", "référence Play Data safety"),
            ("Nutrition", "référence Apple privacy nutrition"),
            ("non collecté (transcription sur appareil)", "label audio cohérent"),
            ("NON collectées", "labels santé/localisation cohérents"),
            ("pentest_prep.py", "périmètre pen test rattaché au scan"),
        ]:
            if needle not in cl:
                failures.append(f"RELEASE_CHECKLIST.md: {label} absent")

    # 4. Cohérence politique ↔ landing : la FAQ promet « jamais d'audio » ;
    #    la politique doit le garantir aussi.
    if privacy_text and "transcrit" not in privacy_text:
        failures.append("PRIVACY.md: l'engagement transcription/audio est absent")

    if failures:
        print(f"❌ {len(failures)} problème(s) livrables stores :")
        for f in failures:
            print("  -", f)
        return 1
    print("✅ Livrables stores conformes (6 fiches × 80c OK, 0 promesse "
          "interdite, privacy labels ↔ PRIVACY.md cohérents).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
