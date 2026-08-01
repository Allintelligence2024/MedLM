#!/usr/bin/env python3
"""
check_landing.py — vérifie la landing page statique (site/, Phase 19.7).

Garde-fous :
  * parité i18n : chaque clé existe en fr/ar/en, aucune valeur vide ;
  * toutes les clés utilisées dans index.html existent dans i18n.json
    (et réciproquement — pas de clé orpheline) ;
  * le contenu FR est INLINÉ dans le HTML (SEO + dégradation sans JS) ;
  * aucun tracker / service tiers (analytics, pixels, CDN) : la page
    ne doit charger que ses propres fichiers ;
  * html gère dir=rtl via app.js et la langue est FR par défaut.

Usage : python3 tools/scripts/check_landing.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[2] / "site"

FORBIDDEN_EXTERNAL = [
    "google-analytics", "googletagmanager", "gtag(", "fbq(",
    "connect.facebook", "hotjar", "segment.io", "mixpanel",
    "fonts.googleapis", "cdn.jsdelivr", "unpkg.com", "cloudflare.com/ajax",
    "plausible", "matomo",
]


def main() -> int:
    failures: list[str] = []

    html_path = SITE / "index.html"
    i18n_path = SITE / "i18n.json"
    for p in (html_path, SITE / "styles.css", SITE / "app.js",
              SITE / "robots.txt", i18n_path):
        if not p.exists():
            failures.append(f"fichier manquant : {p.name}")

    if failures:
        for f in failures:
            print("  -", f)
        return 1

    html = html_path.read_text(encoding="utf-8")
    catalog = json.loads(i18n_path.read_text(encoding="utf-8"))

    # 1. Parité des clés i18n (fr/ar/en, valeurs non vides).
    for key, entry in sorted(catalog.items()):
        for lang in ("fr", "ar", "en"):
            val = entry.get(lang)
            if not isinstance(val, str) or not val.strip():
                failures.append(f"clé {key!r} : valeur {lang} manquante ou vide")
        if set(entry.keys()) - {"fr", "ar", "en"}:
            failures.append(
                f"clé {key!r} : langues inattendues {sorted(set(entry) - {'fr', 'ar', 'en'})}")

    # 2. Toutes les clés du HTML existent dans le catalogue, et
    #    réciproquement (pas de clé orpheline).
    html_keys = set(re.findall(r'data-i18n(?:-placeholder)?="([\w.]+)"', html))
    missing = html_keys - set(catalog)
    orphan = set(catalog) - html_keys - {"meta.title", "meta.description"}
    if missing:
        failures.append(f"clés utilisées dans le HTML mais absentes d'i18n.json : {sorted(missing)}")
    if orphan:
        failures.append(f"clés orphelines (inutilisées par le HTML) : {sorted(orphan)}")

    # 3. Contenu FR inliné : chaque balise data-i18n doit avoir un texte.
    empty_tags = re.findall(r'data-i18n="[\w.]+"[^>]*>\s*</', html)
    if empty_tags:
        failures.append(
            f"{len(empty_tags)} balise(s) data-i18n sans contenu FR inliné")
    empty_ph = re.findall(r'data-i18n-placeholder="[\w.]+"(?![^>]*placeholder=)', html)
    if empty_ph:
        failures.append("placeholder data-i18n-placeholder sans valeur FR inlinée")

    # 4. Aucune ressource tierce / tracker.
    lowered = html.lower() + (SITE / "app.js").read_text(encoding="utf-8").lower()
    for marker in FORBIDDEN_EXTERNAL:
        if marker in lowered:
            failures.append(f"ressource tierce interdite détectée : {marker}")

    # 5. Base SEO / a11y / RTL.
    if 'lang="fr"' not in html:
        failures.append("la page doit être en FR par défaut (html lang)")
    if 'document.documentElement.dir' not in (SITE / "app.js").read_text(encoding="utf-8"):
        failures.append("app.js doit basculer dir=rtl pour l'arabe")
    if "<h1" not in html or html.count("<h1") != 1:
        failures.append("exactement un <h1> attendu (SEO/a11y)")
    if 'rel="noopener"' not in html:
        failures.append("les liens externes doivent porter rel=noopener")

    if failures:
        print(f"❌ {len(failures)} problème(s) landing page :")
        for f in failures:
            print("  -", f)
        return 1
    print(f"✅ Landing page conforme ({len(catalog)} clés × 3 langues, "
          "contenu FR inliné, zéro tracker).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
