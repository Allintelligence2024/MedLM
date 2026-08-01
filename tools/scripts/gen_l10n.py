#!/usr/bin/env python3
"""Génère mobile/lib/l10n/app_localizations.dart depuis les .arb.

Équivalent minimal de `flutter gen-l10n`, écrit en Python pour deux
raisons :

  * le dépôt doit rester compilable SANS étape de génération préalable
    (même décision que pour le code Drift, audit P0-2b) ;
  * la génération doit être vérifiable en CI et hors SDK Flutter.

L'API produite est volontairement identique à celle de gen-l10n
(`AppLocalizations.of(context)`, `localizationsDelegates`,
`supportedLocales`) : basculer sur l'outil officiel plus tard ne
demanderait aucun changement côté appelant.

Usage :
    python3 tools/scripts/gen_l10n.py            # écrit le fichier
    python3 tools/scripts/gen_l10n.py --check    # échoue s'il est périmé
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
L10N = ROOT / "mobile" / "lib" / "l10n"
OUT = L10N / "app_localizations.dart"
LANGS = (("fr", "Fr"), ("ar", "Ar"), ("en", "En"))


PLURAL_RE = re.compile(r"^\{(\w+),\s*plural,\s*(.*)\}$", re.S)


def load_arbs() -> tuple[dict, dict[str, dict]]:
    arbs = {
        lang: json.loads((L10N / f"app_{lang}.arb").read_text(encoding="utf-8"))
        for lang, _ in LANGS
    }
    return arbs["fr"], arbs


def declared(fr: dict, key: str) -> dict:
    m = fr.get("@" + key)
    return m.get("placeholders", {}) if isinstance(m, dict) else {}


def dart_type(spec: dict) -> str:
    return "int" if spec.get("type") == "int" else "String"


def parse_plural(value: str):
    """Découpe une expression ICU plural en ses branches."""
    m = PLURAL_RE.match(value.strip())
    if not m:
        return None
    var, body = m.group(1), m.group(2)
    branches: dict[str, str] = {}
    i = 0
    while i < len(body):
        while i < len(body) and body[i].isspace():
            i += 1
        if i >= len(body):
            break
        j = body.index("{", i)
        selector = body[i:j].strip()
        depth, k = 1, j + 1
        while depth:
            if body[k] == "{":
                depth += 1
            elif body[k] == "}":
                depth -= 1
            k += 1
        branches[selector] = body[j + 1 : k - 1]
        i = k
    return var, branches


def esc(s: str) -> str:
    return (
        s.replace("\\", r"\\")
        .replace("'", r"\'")
        .replace("$", r"\$")
        .replace("\n", r"\n")
    )


def interpolate(text: str, placeholders: dict) -> str:
    out = esc(text)
    for name in placeholders:
        out = out.replace("{" + name + "}", "${" + name + "}")
    return out


PREAMBLE = """// GENERATED — ne pas éditer à la main.
//
// Produit par `tools/scripts/gen_l10n.py` à partir de `lib/l10n/*.arb`.
// Régénérer après toute modification des .arb :
//     python3 tools/scripts/gen_l10n.py
//
// Ce fichier est COMMITÉ (décision d'audit P0-2b, comme le code Drift) :
// le dépôt reste compilable sans étape de génération, et la CI vérifie
// sa fraîcheur via `python3 tools/scripts/gen_l10n.py --check`.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

/// Accès aux chaînes traduites de l'application.
abstract class AppLocalizations {
  const AppLocalizations(this.localeName);

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    final instance =
        Localizations.of<AppLocalizations>(context, AppLocalizations);
    assert(instance != null,
        'AppLocalizations absent : vérifier localizationsDelegates.');
    return instance!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  static const List<Locale> supportedLocales = <Locale>[
    Locale('fr'),
    Locale('ar'),
    Locale('en'),
  ];
"""

DELEGATE = """class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      <String>['fr', 'ar', 'en'].contains(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) =>
      SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }
  // Le français est la langue de rédaction du produit : c'est le repli.
  return AppLocalizationsFr();
}
"""


def generate() -> str:
    fr, arbs = load_arbs()
    keys = [k for k in fr if not k.startswith("@")]
    lines: list[str] = [PREAMBLE]

    for key in keys:
        ph = declared(fr, key)
        if ph:
            params = ", ".join(f"{dart_type(s)} {n}" for n, s in ph.items())
            lines.append(f"  String {key}({params});")
        else:
            lines.append(f"  String get {key};")
    lines.append("}\n")
    lines.append(DELEGATE)

    for lang, cls in LANGS:
        arb = arbs[lang]
        lines.append(f"class AppLocalizations{cls} extends AppLocalizations {{")
        lines.append(
            f"  AppLocalizations{cls}([String locale = '{lang}']) : super(locale);\n"
        )
        for key in keys:
            ph = declared(fr, key)
            value = arb[key]
            plural = parse_plural(value) if ph else None
            lines.append("  @override")
            if plural:
                var, branches = plural
                params = ", ".join(f"{dart_type(s)} {n}" for n, s in ph.items())
                lines.append(f"  String {key}({params}) {{")
                other = ""
                for selector in sorted(branches, key=lambda s: (not s.startswith("="), s)):
                    rendered = interpolate(branches[selector], ph)
                    if selector.startswith("="):
                        lines.append(
                            f"    if ({var} == {selector[1:]}) return '{rendered}';"
                        )
                    elif selector == "other":
                        other = rendered
                lines.append(f"    return '{other}';")
                lines.append("  }\n")
            elif ph:
                params = ", ".join(f"{dart_type(s)} {n}" for n, s in ph.items())
                lines.append(f"  String {key}({params}) => '{interpolate(value, ph)}';\n")
            else:
                lines.append(f"  String get {key} => '{esc(value)}';\n")
        lines.append("}\n")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="échoue si le fichier généré est absent ou périmé",
    )
    args = parser.parse_args()

    content = generate()
    if args.check:
        if not OUT.exists():
            print(f"❌ {OUT.relative_to(ROOT)} absent — lancer tools/scripts/gen_l10n.py")
            return 1
        if OUT.read_text(encoding="utf-8") != content:
            print(
                f"❌ {OUT.relative_to(ROOT)} périmé — relancer tools/scripts/gen_l10n.py "
                "et committer le résultat."
            )
            return 1
        print("✅ app_localizations.dart à jour.")
        return 0

    OUT.write_text(content, encoding="utf-8")
    keys = [k for k in load_arbs()[0] if not k.startswith("@")]
    print(f"✅ {OUT.relative_to(ROOT)} généré ({len(keys)} clés × {len(LANGS)} langues).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

