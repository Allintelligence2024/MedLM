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
              SITE / "robots.txt", SITE / "sitemap.xml", i18n_path):
        if not p.exists():
            failures.append(f"fichier manquant : {p.name}")

    if failures:
        for f in failures:
            print("  -", f)
        return 1

    # Sitemap (audit P3-1) : il n'existait pas alors que robots.txt
    # était en place. Un robots.txt sans sitemap laisse l'indexation
    # au hasard du crawl.
    robots = (SITE / "robots.txt").read_text(encoding="utf-8")
    sitemap = (SITE / "sitemap.xml").read_text(encoding="utf-8")
    if "Sitemap:" not in robots:
        failures.append("robots.txt ne déclare pas le sitemap")
    if "sitemap.xml" not in robots:
        failures.append("robots.txt : la déclaration ne pointe pas sitemap.xml")
    try:
        import xml.etree.ElementTree as ET

        root = ET.fromstring(sitemap)
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = [u.findtext("s:loc", default="", namespaces=ns) for u in root]
        if len(locs) != 3:
            failures.append(f"sitemap.xml : {len(locs)} URL(s), 3 attendues (fr/ar/en)")
        for loc in locs:
            if not loc.startswith("https://"):
                failures.append(f"sitemap.xml : URL non HTTPS « {loc} »")
        if len(set(locs)) != len(locs):
            failures.append("sitemap.xml : URL dupliquée")
        # Les trois langues doivent être déclarées en alternates,
        # sinon les moteurs voient du contenu dupliqué.
        for lang in ("fr", "ar", "en"):
            if f'hreflang="{lang}"' not in sitemap:
                failures.append(f"sitemap.xml : hreflang « {lang} » absent")
    except ET.ParseError as e:
        failures.append(f"sitemap.xml : XML invalide ({e})")

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
          "contenu FR inliné, zéro tracker, sitemap 3 URLs déclaré).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
