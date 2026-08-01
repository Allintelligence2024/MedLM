#!/usr/bin/env python3
r"""
check_syntax_guard.py — garde-fou syntaxique statique (sans SDK).

Le sandbox n'a ni SDK Dart ni node_modules : ni `dart analyze` ni
`tsc --noEmit` ne peuvent tourner ici. Ce script apporte le filet de
sécurité structurel côté texte, complément de security_audit.py :

  1. MARQUEURS DE CONFLIT git (chevrons x7 puis espace, ligne de 7
     signes égal) interdits dans tout le repo texte — les constantes
     sont construites dynamiquement pour que ce fichier puisse se
     scanner lui-même sans faux positif ;
  2. DÉLIMITERS — après neutralisation des chaînes et commentaires,
     (), {}, [] doivent être équilibrés en nombre dans les fichiers
     Dart (mobile/) et Python (tools/, tests/).

Périmètre volontaire (faux positifs évités, foi du lexer) :
  - TS/TSX/JS EXCLUS du contrôle de délimiters : littéraux regex
    (/a{b}c/g) et gabarits `a${f(`b`)}` imbriqués impossibles à
    neutraliser sans vrai lexer — vérifié empiriquement sur
    i18n.ts, llm-mock.provider.ts, exam_templates.service.ts ;
  - Python : `//` est la division entière, JAMAIS un commentaire ;
    les commentaires sont `#` (strippés) — sans cette distinction
    fsrs_reference.py et generate_golden.py échouaient ;
  - Dart : chaînes entières neutralisées, l'interpolation ${...}
    disparaît avec elles (équilibre préservé).

Usage : python3 tools/scripts/check_syntax_guard.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Construits dynamiquement : ce script se scanne lui-même.
MERGE_MARKERS = ("<" * 7 + " ", ">" * 7 + " ")
MERGE_MID = re.compile(r"^={7}\s*$")

BINARY_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".pem",
    ".whl", ".lock", ".bin", ".pyc", ".jar", ".gz", ".zip",
}

SKIP_PARTS = {".git", "node_modules", ".dart_tool", "build", ".venv"}

# (globs, langage) — langage ∈ {"dart", "python"}
DELIMITER_SCOPES = (
    (("mobile/lib/**/*.dart", "mobile/test/**/*.dart"), "dart"),
    (("tools/**/*.py", "tests/**/*.py"), "python"),
)


def strip_common_strings(src: str) -> str:
    """Neutralise chaînes triples puis simples/doubles (une ligne)."""
    src = re.sub(r"'''[\s\S]*?'''", "''", src)
    src = re.sub(r'"""[\s\S]*?"""', '""', src)
    src = re.sub(r"'(?:\\.|[^'\\\n])*'", "''", src)
    src = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', src)
    return src


def strip_python(src: str) -> str:
    src = strip_common_strings(src)
    # UNIQUEMENT les commentaires `#` — `//` est la division entière.
    return re.sub(r"#[^\n]*", "", src)


def strip_dart(src: str) -> str:
    src = strip_common_strings(src)
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)
    return re.sub(r"//[^\n]*", "", src)


STRIPPERS = {"python": strip_python, "dart": strip_dart}


def main() -> int:
    failures: list[str] = []
    checked = 0

    # 1. Marqueurs de conflit sur tout le repo texte (ce fichier inclus).
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.suffix.lower() in BINARY_SUFFIXES:
            continue
        if any(part in SKIP_PARTS for part in p.parts):
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            continue
        for marker in MERGE_MARKERS:
            if marker in text:
                failures.append(
                    f"{p.relative_to(ROOT)}: marqueur de conflit "
                    f"{marker.strip()!r}")
        if p.suffix == ".md":
            continue  # setext headings `=======` légitimes en markdown
        for i, line in enumerate(text.splitlines(), 1):
            if MERGE_MID.match(line):
                failures.append(
                    f"{p.relative_to(ROOT)}:{i}: ligne de conflit ponctuelle")
                break

    # 2. Délimiters équilibrés sur Dart + Python.
    for globs, lang in DELIMITER_SCOPES:
        strip = STRIPPERS[lang]
        for pattern in globs:
            for p in sorted(ROOT.glob(pattern)):
                checked += 1
                stripped = strip(p.read_text(encoding="utf-8"))
                for open_c, close_c in (("(", ")"), ("{", "}"), ("[", "]")):
                    a, b = stripped.count(open_c), stripped.count(close_c)
                    if a != b:
                        failures.append(
                            f"{p.relative_to(ROOT)}: délimiters "
                            f"{open_c}{close_c} déséquilibrés ({a} vs {b})")

    if failures:
        print(f"X {len(failures)} problème(s) syntax guard :")
        for f in failures[:30]:
            print("  -", f)
        if len(failures) > 30:
            print(f"  ... et {len(failures) - 30} autres")
        return 1
    print(f"OK syntax guard : {checked} fichiers de code équilibrés, "
          "0 marqueur de conflit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
