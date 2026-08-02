#!/usr/bin/env python3
"""Garde statique des appels de constructeurs Flutter sans SDK Dart.

Elle verrouille les erreurs mécaniques les plus fréquentes : un paramètre
nommé requis oublié ou un nom de paramètre inventé à l'appel d'un widget.
Ce n'est pas un substitut à ``flutter analyze`` : le parseur est volontairement
conservateur et ignore les constructeurs ou appels qu'il ne peut pas lire.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DART = ROOT / "mobile" / "lib"

# Classe + constructeur const/non-const à paramètres nommés sur une ligne ou
# plusieurs. Les signatures Dart complexes restent ignorées plutôt que de
# produire un faux positif.
CTOR = re.compile(
    r"class\s+(\w+)\b.*?\b(?:const\s+)?\1\s*\(\s*\{(.*?)\}\s*\)", re.S
)
PARAM = re.compile(r"\b(required\s+)?(?:[\w<>?, ]+\s+)?(\w+)\s*(?:[=,}])")
CALL = re.compile(r"\b(\w+)\s*\(\s*([\s\S]*?)\s*\)")
NAMED = re.compile(r"(?:^|,)\s*(\w+)\s*:")


def strip_comments(text: str) -> str:
    text = re.sub(r"//.*?$|/\*[\s\S]*?\*/", "", text, flags=re.M)
    # Un texte interpolé peut ressembler à un appel (ex. `XpAward(...)` dans
    # toString). Il ne constitue pas une instanciation de widget.
    return re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"", "''", text)


def main() -> int:
    constructors: dict[str, tuple[set[str], set[str]]] = {}
    sources: dict[Path, str] = {}
    for path in DART.rglob("*.dart"):
        text = strip_comments(path.read_text(encoding="utf-8"))
        sources[path] = text
        for match in CTOR.finditer(text):
            allowed: set[str] = set()
            required: set[str] = set()
            for parameter in match.group(2).split(","):
                parsed = PARAM.search(parameter + ",")
                if not parsed:
                    continue
                name = parsed.group(2)
                allowed.add(name)
                if re.search(r"\brequired\b", parameter):
                    required.add(name)
            constructors[match.group(1)] = (allowed, required)

    failures: list[str] = []
    for path, text in sources.items():
        for match in CALL.finditer(text):
            widget = match.group(1)
            if widget not in constructors:
                continue
            # A call containing a nested closure is ambiguous for this small
            # parser; flutter analyze remains authoritative in that case.
            args = match.group(2)
            if "{" in args or "(" in args:
                continue
            allowed, required = constructors[widget]
            given = set(NAMED.findall(args))
            missing = required - given
            unknown = given - allowed
            if missing:
                failures.append(f"{path.relative_to(ROOT)}: {widget}: requis absent(s) {', '.join(sorted(missing))}")
            if unknown:
                failures.append(f"{path.relative_to(ROOT)}: {widget}: paramètre(s) inconnu(s) {', '.join(sorted(unknown))}")

    if failures:
        print("❌ Appels de widgets invalides :")
        print("\n".join(f"  · {failure}" for failure in failures))
        return 1
    print(f"✅ Widgets Dart : {len(constructors)} constructeurs contrôlés, aucun appel mécaniquement invalide.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
