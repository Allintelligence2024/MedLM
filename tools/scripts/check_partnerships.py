#!/usr/bin/env python3
"""
check_partnerships.py — cohérence partenariats facultés (Phase 20.4).

Verrous :
  * allow-list UNIQUE des facultés (faculties.ts) : les `faculty`
    citées dans le contenu embarqué (mobile/assets/content) doivent y
    figurer — une coquille de ville dans le contenu casse le pipeline ;
  * migration 0016 : CHECK des statuts, bornes commission 0..50, index
    partiel UNIQUE un seul actif par faculté ;
  * machine à états : terminated puit, activation signée (présents dans
    partnership-status.ts) ;
  * controller gardé (JwtGuard + RbacGuard) avec rôles author/editor.

Usage : python3 tools/scripts/check_partnerships.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
P = ROOT / "backend" / "src" / "partnerships"
# Résolution par suffixe (la série a déjà été renumérotée une fois).
_MIGDIR = ROOT / "backend" / "src" / "db" / "migrations"
_MATCHES = sorted(_MIGDIR.glob("*_partnerships.sql"))
MIG = _MATCHES[-1] if _MATCHES else _MIGDIR / "0015_partnerships.sql"
CONTENT = ROOT / "mobile" / "assets" / "content"


def main() -> int:
    failures: list[str] = []

    faculties_ts = (P / "faculties.ts").read_text(encoding="utf-8")
    allow = set(re.findall(r"^\s*'([^']+)',\s*$", faculties_ts, re.M))
    if len(allow) < 8:
        failures.append(f"allow-list trop courte : {sorted(allow)}")

    # 1. Le contenu embarqué ne cite que des facultés connues.
    cited = set()
    for f in sorted(CONTENT.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        text = json.dumps(data, ensure_ascii=False)
        for m in re.finditer(r'"faculty"\s*:\s*"([^"]+)"', text):
            cited.add(m.group(1))
    unknown = cited - allow
    if unknown:
        failures.append(
            f"facultés citées dans le contenu mais hors allow-list : {sorted(unknown)}")

    # 2. Migration 0016.
    mig = MIG.read_text(encoding="utf-8") if MIG.exists() else ""
    if not mig:
        failures.append("*_partnerships.sql manquant")
    else:
        for needle, label in [
            ("CHECK (status IN ('draft', 'active', 'suspended', 'terminated'))",
             "CHECK des statuts"),
            ("commission_pct >= 0 AND commission_pct <= 50",
             "bornes commission 0..50"),
            ("CREATE UNIQUE INDEX IF NOT EXISTS partnerships_active_faculty_idx",
             "index partiel UNIQUE (1 actif/faculté)"),
            ("WHERE status = 'active'", "condition partielle sur active"),
        ]:
            if needle not in mig:
                failures.append(f"migration 0016 : {label} absent")

    # 3. Machine à états pure.
    status_ts = (P / "partnership-status.ts").read_text(encoding="utf-8")
    if not re.search(r"terminated:\s*\[\]", status_ts):
        failures.append("terminated doit être un état puit (ligne vide)")
    if "signature manquante" not in status_ts:
        failures.append("activation signée : garde-fou 'signature manquante' absent")
    if not re.search(r"draft:\s*\['active', 'terminated'\]", status_ts):
        failures.append("transitions draft inattendues")
    if not re.search(r"active:\s*\['suspended', 'terminated'\]", status_ts):
        failures.append("transitions active inattendues")
    if not re.search(r"suspended:\s*\['active', 'terminated'\]", status_ts):
        failures.append("transitions suspended inattendues")

    # 4. Controller gardé + zod.
    ctrl = (P / "partnerships.controller.ts").read_text(encoding="utf-8")
    if "@UseGuards(JwtGuard, RbacGuard)" not in ctrl:
        failures.append("controller : @UseGuards(JwtGuard, RbacGuard) manquant")
    if "@RequireRole('editor')" not in ctrl:
        failures.append("controller : les écritures doivent exiger editor")
    if "@RequireRole('author')" not in ctrl:
        failures.append("controller : la lecture doit exiger author")

    if failures:
        print(f"❌ {len(failures)} problème(s) partenariats :")
        for f in failures:
            print("  -", f)
        return 1
    print(f"✅ Partenariats cohérents ({len(allow)} facultés allow-list, "
          f"{len(cited)} citées dans le contenu, migration + machine OK).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
