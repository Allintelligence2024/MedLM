#!/usr/bin/env python3
"""Garde-fou Dart statique — erreurs de compilation grossières.

Ce script N'EST PAS un substitut à `flutter analyze` : c'est un filet
de sécurité exécutable *sans* SDK Dart, pour les environnements où il
n'est pas disponible.

Il existe parce que l'audit a mis au jour deux fichiers de `mobile/lib/`
qui n'avaient JAMAIS pu compiler et que personne n'avait vus :

  * `domain/usecases/sync_outbox.dart` déclarait `class Outcome { … }`
    À L'INTÉRIEUR d'une autre classe — Dart interdit les classes
    imbriquées ;
  * `core/anticheat/exam_anticheat.dart` écrivait
    `AntiCheatKindWire().wire` — une extension ne s'instancie pas.

Le garde-fou syntaxique existant (`check_syntax_guard.py`) ne vérifie
que l'équilibrage des délimiteurs : ces deux erreurs passaient au
travers. Et aucune CI n'exécutait le SDK Dart (audit P0-3).

Règles vérifiées :
  1. aucune déclaration de `class` / `enum` / `mixin` imbriquée ;
  2. aucune instanciation d'`extension` (`NomExtension()`) ;
  3. tout fichier de `lib/` importé par un autre existe réellement ;
  4. `part 'x.g.dart'` → le fichier généré est présent (sinon le
     projet ne compile pas — c'était le cas de app_database.g.dart).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOBILE = ROOT / "mobile"
LIB = MOBILE / "lib"
TEST = MOBILE / "test"

failures: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def strip_noise(source: str) -> str:
    """Retire commentaires et littéraux — sans décaler les lignes."""
    out = []
    i, n = 0, len(source)
    while i < n:
        ch = source[i]
        if ch == "/" and i + 1 < n and source[i + 1] == "/":
            j = source.find("\n", i)
            i = n if j == -1 else j
        elif ch == "/" and i + 1 < n and source[i + 1] == "*":
            j = source.find("*/", i + 2)
            block = source[i : (n if j == -1 else j + 2)]
            out.append("\n" * block.count("\n"))
            i = n if j == -1 else j + 2
        elif ch in "'\"":
            quote = ch
            triple = source[i : i + 3] == quote * 3
            end_marker = quote * 3 if triple else quote
            j = i + len(end_marker)
            while j < n:
                if source[j] == "\\":
                    j += 2
                    continue
                if source[j : j + len(end_marker)] == end_marker:
                    j += len(end_marker)
                    break
                j += 1
            literal = source[i:j]
            out.append("''" + "\n" * literal.count("\n"))
            i = j
        else:
            out.append(ch)
            i += 1
    return "".join(out)


DECL_RE = re.compile(
    r"^(?P<indent>[ \t]*)(?:abstract\s+|final\s+|base\s+|interface\s+|sealed\s+)*"
    r"(?P<kw>class|enum|mixin|extension)\s+(?P<name>\w+)",
)


def check_nested_declarations(rel: str, cleaned: str) -> None:
    depth = 0
    for lineno, line in enumerate(cleaned.splitlines(), 1):
        m = DECL_RE.match(line)
        if m and depth > 0:
            fail(
                f"{rel}:{lineno} : déclaration `{m.group('kw')} {m.group('name')}` "
                f"imbriquée (Dart l'interdit — la sortir au niveau supérieur)"
            )
        depth += line.count("{") - line.count("}")
        depth = max(depth, 0)


def check_extension_instantiation(rel: str, cleaned: str, extensions: set[str]) -> None:
    if not extensions:
        return
    pattern = re.compile(r"\b(" + "|".join(sorted(extensions)) + r")\s*\(")
    for lineno, line in enumerate(cleaned.splitlines(), 1):
        for m in pattern.finditer(line):
            fail(
                f"{rel}:{lineno} : `{m.group(1)}(…)` instancie une extension — "
                "une extension s'applique à une valeur, elle ne se construit pas"
            )


PART_RE = re.compile(r"^\s*part\s+'([^']+)'\s*;", re.M)
IMPORT_RE = re.compile(r"^\s*import\s+'([^']+)'\s*;", re.M)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="traite le code généré manquant (*.g.dart) comme une erreur ; "
        "à utiliser en CI, après `dart run build_runner build`",
    )
    strict = parser.parse_args().strict

    if not LIB.exists():
        print(f"❌ {LIB} introuvable")
        return 1

    dart_files = sorted(LIB.rglob("*.dart")) + sorted(TEST.rglob("*.dart"))
    sources = {f: f.read_text(encoding="utf-8") for f in dart_files}
    cleaned = {f: strip_noise(src) for f, src in sources.items()}

    # Collecte globale des extensions déclarées.
    extensions: set[str] = set()
    for text in cleaned.values():
        for m in re.finditer(r"^\s*extension\s+(\w+)\s+on\b", text, re.M):
            extensions.add(m.group(1))

    for path, text in cleaned.items():
        rel = path.relative_to(MOBILE).as_posix()
        check_nested_declarations(rel, text)
        check_extension_instantiation(rel, text, extensions)

        # `part` / `import` se lisent sur la source ORIGINALE : le
        # nettoyage remplace les littéraux par '' et effacerait les
        # chemins qu'on veut justement vérifier.
        raw = sources[path]

        # `part` : le fichier généré doit exister.
        #
        # Sans SDK Dart (sandbox), on ne peut pas produire le code
        # généré : on signale sans bloquer. La CI mobile, elle, lance
        # `build_runner` PUIS ce script en `--strict` : le manquant y
        # devient une erreur.
        for target in PART_RE.findall(raw):
            if not (path.parent / target).exists():
                message = (
                    f"{rel} : `part '{target}'` mais le fichier n'existe pas — "
                    "lancer `dart run build_runner build` et committer le résultat"
                )
                (fail if strict else warn)(message)

        # Imports relatifs : la cible doit exister.
        for target in IMPORT_RE.findall(raw):
            if target.startswith(("dart:", "package:")):
                continue
            if not (path.parent / target).exists():
                fail(f"{rel} : import relatif cassé « {target} »")

    # Imports `package:medanki_dz/...` → chemin sous lib/.
    for path, raw in sources.items():
        rel = path.relative_to(MOBILE).as_posix()
        for target in IMPORT_RE.findall(raw):
            if not target.startswith("package:medanki_dz/"):
                continue
            sub = target[len("package:medanki_dz/") :]
            if not (LIB / sub).exists():
                fail(f"{rel} : import `package:medanki_dz/{sub}` sans fichier correspondant")

    for w in warnings:
        print(f"  ⚠  {w}")
    for f in failures:
        print(f"  ❌ {f}")
    if failures:
        print(f"\n❌ Dart statique : {len(failures)} problème(s).")
        return 1
    suffix = f" ({len(warnings)} avertissement(s))" if warnings else ""
    print(
        f"✅ Dart statique OK ({len(dart_files)} fichiers : 0 déclaration imbriquée, "
        f"0 extension instanciée, imports résolus){suffix}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
