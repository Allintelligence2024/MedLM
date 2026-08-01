#!/usr/bin/env python3
"""Chaque `l10n.clé(...)` du code existe-t-il vraiment ? (audit P1-4)

Sans SDK Dart dans cet environnement, une faute de frappe dans
`l10n.studyShowAnswer` ou un mauvais nombre d'arguments ne se verrait
qu'au premier `flutter analyze` — c'est-à-dire après le push. Or ce lot
a introduit ~180 clés et une centaine de sites d'appel écrits à la main :
c'est exactement le genre d'erreur qu'on commet en volume.

Ce script rejoue le travail du compilateur sur ce point précis :

  1. il extrait la surface publique de `AppLocalizations` (getters et
     méthodes, avec leur arité) depuis le fichier généré ;
  2. il relève tous les usages `l10n.x`, `AppLocalizations.of(ctx).x`,
     `dialogL10n.x`… dans `lib/` et `test/` ;
  3. il signale : clé inexistante, getter appelé comme une méthode,
     méthode utilisée comme un getter, mauvais nombre d'arguments.

Il vérifie aussi l'inverse — les clés déclarées mais jamais utilisées —
en avertissement seulement : une clé peut légitimement précéder l'écran
qui la consommera.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOBILE = ROOT / "mobile"
GENERATED = MOBILE / "lib" / "l10n" / "app_localizations.dart"

failures: list[str] = []
warnings: list[str] = []

# Déclarations de la classe abstraite : `String get x;` et `String x(int a);`
GETTER_DECL = re.compile(r"^\s*String\s+get\s+(\w+)\s*;", re.M)
METHOD_DECL = re.compile(r"^\s*String\s+(\w+)\(([^)]*)\)\s*;", re.M)

# Identifiants portant une instance d'AppLocalizations. `l10n` est la
# convention du projet ; on accepte les variantes locales rencontrées.
# `\b` en tête : sans lui, « app_localizations.dart » (dans un import)
# matcherait « localizations.dart » et produirait une fausse clé « dart ».
HOLDERS = r"\b(?:l10n|dialogL10n|localizations|AppLocalizations\.of\(context\)|AppLocalizations\.of\(ctx\))"
USAGE = re.compile(HOLDERS + r"\.(\w+)")


def strip_comments(source: str) -> str:
    """Neutralise les commentaires sans décaler les numéros de ligne."""
    out: list[str] = []
    for line in source.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("//"):
            out.append("")
        else:
            # Commentaire en fin de ligne : on coupe, sauf s'il est dans
            # une chaîne (approximation suffisante ici).
            idx = line.find("//")
            out.append(line[:idx] if idx > 0 and line.count('"', 0, idx) % 2 == 0 else line)
    return "\n".join(out)


def parse_surface() -> tuple[set[str], dict[str, int]]:
    """(getters, méthodes → nombre de paramètres)."""
    if not GENERATED.exists():
        failures.append(
            f"{GENERATED.relative_to(ROOT)} absent — lancer tools/scripts/gen_l10n.py"
        )
        return set(), {}
    text = GENERATED.read_text(encoding="utf-8")
    # On ne lit QUE la classe abstraite : les implémentations répètent
    # les mêmes noms et fausseraient le compte.
    end = text.find("class _AppLocalizationsDelegate")
    header = text[:end] if end > 0 else text

    getters = set(GETTER_DECL.findall(header))
    methods: dict[str, int] = {}
    for name, params in METHOD_DECL.findall(header):
        arity = len([p for p in params.split(",") if p.strip()])
        methods[name] = arity
    return getters, methods


def count_call_args(source: str, start: int) -> int | None:
    """Nombre d'arguments de l'appel qui commence à `start` ('(').

    La virgule finale (« trailing comma ») est idiomatique en Dart et
    ne doit PAS compter pour un argument de plus : on compte les
    segments non vides séparés par des virgules de niveau 1.
    """
    if start >= len(source) or source[start] != "(":
        return None
    depth, i = 0, start
    segment_has_content = False
    args = 0
    while i < len(source):
        c = source[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
            if depth == 0:
                return args + 1 if segment_has_content else args
        elif c == "," and depth == 1:
            if segment_has_content:
                args += 1
            segment_has_content = False
        elif not c.isspace() and depth == 1:
            segment_has_content = True
        i += 1
    return None


def main() -> int:
    getters, methods = parse_surface()
    if failures:
        for f in failures:
            print(f"  ❌ {f}")
        return 1

    known = getters | set(methods)
    used: set[str] = set()

    targets = sorted(MOBILE.rglob("lib/**/*.dart")) + sorted(
        MOBILE.rglob("test/**/*.dart")
    )
    for path in targets:
        if path == GENERATED:
            continue
        rel = path.relative_to(MOBILE).as_posix()
        raw = path.read_text(encoding="utf-8")
        source = strip_comments(raw)
        # Les directives d'import ne contiennent aucun appel.
        source = "\n".join(
            "" if line.lstrip().startswith(("import ", "export ", "part "))
            else line
            for line in source.splitlines()
        )

        for match in USAGE.finditer(source):
            key = match.group(1)
            # Les membres de la classe elle-même ne sont pas des clés.
            if key in {"of", "delegate", "localizationsDelegates",
                       "supportedLocales", "localeName"}:
                continue
            line = source.count("\n", 0, match.start()) + 1
            used.add(key)

            if key not in known:
                suggestion = closest(key, known)
                hint = f" — vouliez-vous « {suggestion} » ?" if suggestion else ""
                failures.append(
                    f"{rel}:{line} : clé « {key} » inexistante dans AppLocalizations{hint}"
                )
                continue

            after = match.end()
            is_call = after < len(source) and source[after] == "("

            if key in methods and not is_call:
                failures.append(
                    f"{rel}:{line} : « {key} » prend {methods[key]} argument(s) "
                    "mais est utilisée comme un getter"
                )
            elif key in getters and is_call:
                failures.append(
                    f"{rel}:{line} : « {key} » est un getter mais est appelée "
                    "comme une méthode"
                )
            elif key in methods and is_call:
                got = count_call_args(source, after)
                if got is not None and got != methods[key]:
                    failures.append(
                        f"{rel}:{line} : « {key} » attend {methods[key]} argument(s), "
                        f"{got} fourni(s)"
                    )

    for key in sorted(known - used):
        warnings.append(f"clé « {key} » déclarée mais jamais utilisée")

    for w in warnings:
        print(f"  ⚠  {w}")
    for f in failures:
        print(f"  ❌ {f}")
    if failures:
        print(f"\n❌ Usages i18n : {len(failures)} problème(s).")
        return 1

    suffix = f", {len(warnings)} clé(s) inutilisée(s)" if warnings else ""
    print(
        f"✅ Usages i18n valides ({len(used)} clés appelées sur {len(known)} "
        f"déclarées, arités conformes{suffix})."
    )
    return 0


def closest(name: str, candidates: set[str]) -> str | None:
    """Suggestion simple par préfixe/distance grossière."""
    import difflib

    matches = difflib.get_close_matches(name, sorted(candidates), n=1, cutoff=0.75)
    return matches[0] if matches else None


if __name__ == "__main__":
    sys.exit(main())
