#!/usr/bin/env python3
"""Parité de l'allow-list des facultés — serveur ↔ mobile.

Le backend impose une allow-list unique (`FACULTIES_DZ`) : un
partenariat ou une provenance de contenu ne peuvent référencer qu'une
faculté de cette liste (cf. check_partnerships.py). L'écran
d'inscription mobile propose un choix fermé bâti sur la même liste.

Si les deux divergent, l'inscription proposerait une faculté que le
serveur refuse — ou en cacherait une qu'il accepte. Ce script échoue
dans les deux cas.

Vérifie aussi que les bornes d'année d'étude et les niveaux
d'expérience du client correspondent au contrat Zod du serveur.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TS = ROOT / "backend" / "src" / "partnerships" / "faculties.ts"
DART = ROOT / "mobile" / "lib" / "core" / "content" / "faculties.dart"
DTO = ROOT / "backend" / "src" / "onboarding" / "onboarding.dto.ts"

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def ts_faculties() -> list[str]:
    text = TS.read_text(encoding="utf-8")
    block = re.search(r"FACULTIES_DZ[^=]*=\s*Object\.freeze\(\[(.*?)\]", text, re.S)
    if not block:
        fail("FACULTIES_DZ introuvable dans faculties.ts")
        return []
    return re.findall(r"'([^']+)'", block.group(1))


def dart_faculties() -> list[str]:
    text = DART.read_text(encoding="utf-8")
    block = re.search(r"kFacultiesDz\s*=\s*<String>\[(.*?)\]", text, re.S)
    if not block:
        fail("kFacultiesDz introuvable dans faculties.dart")
        return []
    return re.findall(r"'([^']+)'", block.group(1))


def main() -> int:
    server = ts_faculties()
    client = dart_faculties()

    if server and client:
        # L'ORDRE compte aussi : c'est celui présenté à l'utilisateur,
        # et une divergence d'ordre trahit une édition d'un seul côté.
        if server != client:
            for missing in sorted(set(server) - set(client)):
                fail(f"faculté « {missing} » côté serveur, absente du mobile")
            for extra in sorted(set(client) - set(server)):
                fail(f"faculté « {extra} » côté mobile, absente de l'allow-list serveur")
            if set(server) == set(client):
                fail("mêmes facultés mais ordre différent serveur/mobile")

    dto = DTO.read_text(encoding="utf-8")
    dart = DART.read_text(encoding="utf-8")

    # Bornes d'année d'étude.
    years = re.search(r"StudyYearAnswer\s*=\s*z\.number\(\)\.int\(\)\.min\((\d+)\)\.max\((\d+)\)", dto)
    if not years:
        fail("StudyYearAnswer introuvable dans onboarding.dto.ts")
    else:
        lo, hi = int(years.group(1)), int(years.group(2))
        block = re.search(r"kStudyYears\s*=\s*<int>\[(.*?)\]", dart, re.S)
        if not block:
            fail("kStudyYears introuvable dans faculties.dart")
        else:
            client_years = [int(n) for n in re.findall(r"\d+", block.group(1))]
            expected = list(range(lo, hi + 1))
            if client_years != expected:
                fail(
                    f"kStudyYears = {client_years}, attendu {expected} "
                    f"(contrat serveur min={lo} max={hi})"
                )

    # Niveaux d'expérience.
    levels = re.search(r"ExperienceLevelAnswer\s*=\s*z\.enum\(\[(.*?)\]\)", dto, re.S)
    if not levels:
        fail("ExperienceLevelAnswer introuvable dans onboarding.dto.ts")
    else:
        server_levels = re.findall(r"'([^']+)'", levels.group(1))
        block = re.search(r"kExperienceLevels\s*=\s*<String>\[(.*?)\]", dart, re.S)
        if not block:
            fail("kExperienceLevels introuvable dans faculties.dart")
        else:
            client_levels = re.findall(r"'([^']+)'", block.group(1))
            if server_levels != client_levels:
                fail(
                    f"kExperienceLevels = {client_levels}, "
                    f"contrat serveur = {server_levels}"
                )

    for f in failures:
        print(f"  ❌ {f}")
    if failures:
        print(f"\n❌ Parité facultés/onboarding : {len(failures)} problème(s).")
        return 1
    print(
        f"✅ Parité facultés OK ({len(server)} facultés, années et niveaux "
        "alignés sur le contrat serveur)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
