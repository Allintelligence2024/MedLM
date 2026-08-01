#!/usr/bin/env python3
"""Contenu réellement embarqué dans l'application (audit P2-4).

`deck_anatomie_ancien_demo.json` — un deck de démonstration de 4 cartes,
vestige des premières phases — était livré dans le bundle de production
au milieu des 9 decks réels. Il a été déplacé vers
`mobile/assets/content_archive/`, qui n'est PAS déclaré dans
`pubspec.yaml` : il reste consultable dans le dépôt mais n'est plus
compilé dans l'APK.

Ce script empêche la régression :
  1. aucun deck marqué `is_demo: true` dans `assets/content/` ;
  2. le dossier d'archive n'est pas déclaré comme asset Flutter ;
  3. tout deck servi a un identifiant unique et des cartes ;
  4. le dossier d'archive existe et n'est pas vide (sinon on aurait
     supprimé l'historique au lieu de l'archiver).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "mobile" / "assets" / "content"
ARCHIVE = ROOT / "mobile" / "assets" / "content_archive"
PUBSPEC = ROOT / "mobile" / "pubspec.yaml"

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def declared_assets() -> list[str]:
    """Chemins déclarés sous `flutter: assets:` dans pubspec.yaml."""
    text = PUBSPEC.read_text(encoding="utf-8")
    block = re.search(r"^\s{2}assets:\s*$(.*?)(?=^\S|\Z)", text, re.M | re.S)
    if not block:
        return []
    return re.findall(r"^\s*-\s*(\S+)\s*$", block.group(1), re.M)


def main() -> int:
    if not CONTENT.is_dir():
        print(f"❌ {CONTENT} introuvable")
        return 1

    decks = sorted(CONTENT.glob("*.json"))
    if not decks:
        fail("aucun deck dans assets/content/")

    seen_ids: dict[str, str] = {}
    for path in decks:
        name = path.name
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            fail(f"{name} : JSON invalide ({e})")
            continue

        if data.get("is_demo") is True:
            fail(
                f"{name} : deck de démonstration (`is_demo: true`) livré en "
                "production — le déplacer dans assets/content_archive/"
            )
        if "demo" in name.lower() or "ancien" in name.lower():
            fail(f"{name} : nom évoquant un contenu obsolète dans le bundle")

        deck_id = data.get("deck_id")
        if not deck_id:
            fail(f"{name} : deck_id manquant")
        elif deck_id in seen_ids:
            fail(f"{name} : deck_id « {deck_id} » déjà utilisé par {seen_ids[deck_id]}")
        else:
            seen_ids[deck_id] = name

        if not data.get("cards"):
            fail(f"{name} : aucune carte")

    assets = declared_assets()
    for declared in assets:
        if "content_archive" in declared:
            fail(
                f"pubspec.yaml déclare « {declared} » : l'archive ne doit pas "
                "être embarquée dans l'application"
            )
    if "assets/content/" not in assets:
        fail("pubspec.yaml ne déclare plus « assets/content/ »")

    if not ARCHIVE.is_dir() or not any(ARCHIVE.glob("*.json")):
        fail(
            "assets/content_archive/ vide ou absent — le deck legacy devait "
            "être archivé, pas supprimé"
        )

    for f in failures:
        print(f"  ❌ {f}")
    if failures:
        print(f"\n❌ Assets du bundle : {len(failures)} problème(s).")
        return 1

    archived = len(list(ARCHIVE.glob("*.json")))
    print(
        f"✅ Bundle propre ({len(decks)} decks servis, 0 démo, "
        f"{archived} archivé(s) hors bundle)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
