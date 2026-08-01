#!/usr/bin/env python3
"""Résolution des symboles inter-fichiers du code Dart (audit P0-2).

Complète `check_dart_static.py` (qui vérifie la STRUCTURE) en vérifiant
les RÉFÉRENCES : sans SDK Dart dans cet environnement, appeler une
méthode qui n'existe pas, ou l'appeler avec un paramètre nommé
inexistant, ne se verrait qu'au premier `flutter analyze`.

Ce lot a écrit à la main une douzaine d'écrans qui consomment des
repositories, des use cases et un `ApiClient` existants : c'est
exactement là que les erreurs se logent.

Vérifications :
  1. tout `container.x` / `ref.read(xProvider)` cible un membre déclaré ;
  2. tout appel `api.méthode(...)` sur l'ApiClient existe, et ses
     paramètres NOMMÉS sont déclarés par la signature ;
  3. tout paramètre nommé requis de ces méthodes est bien fourni ;
  4. les constructeurs de widgets appelés depuis le routeur reçoivent
     les paramètres requis qu'ils déclarent.

Volontairement conservateur : en cas de doute (surcharge, type
dynamique, cascade), on ne signale rien. Zéro faux positif est plus
utile qu'une couverture exhaustive bruyante.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOBILE = ROOT / "mobile"
LIB = MOBILE / "lib"

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def strip_comments(source: str) -> str:
    out = []
    for line in source.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("//"):
            out.append("")
            continue
        idx = line.find("//")
        out.append(line[:idx] if idx > 0 and line.count('"', 0, idx) % 2 == 0 else line)
    return "\n".join(out)


def balanced_slice(source: str, start: int, opener: str = "(", closer: str = ")") -> str:
    """Contenu équilibré à partir de `start` (qui pointe sur `opener`)."""
    depth, i = 0, start
    while i < len(source):
        c = source[i]
        if c == opener:
            depth += 1
        elif c == closer:
            depth -= 1
            if depth == 0:
                return source[start + 1 : i]
        i += 1
    return ""


# ── Signatures d'une classe donnée ────────────────────────────────────

def class_body(source: str, class_name: str) -> str | None:
    m = re.search(rf"^class\s+{re.escape(class_name)}\b[^{{]*\{{", source, re.M)
    if not m:
        return None
    start = m.end() - 1
    depth, i = 0, start
    while i < len(source):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1 : i]
        i += 1
    return None


# Signature de méthode : on ne tente PAS de décrire le type de retour
# (il peut être `Future<({String a, int b})>`, s'étaler sur plusieurs
# lignes, contenir des génériques imbriqués…). On repère un identifiant
# suivi d'une parenthèse en début d'expression, puis on filtre les
# mots-clés de contrôle. Plus robuste qu'une liste de types.
METHOD_SIG = re.compile(r"(?<![\w.$])(\w+)\s*\(")

# Mots qui ressemblent à une méthode mais n'en sont pas.
NOT_METHODS = {
    "if", "for", "while", "switch", "catch", "return", "await", "throw",
    "assert", "super", "this", "print", "yield", "else", "do", "on",
}


def method_named_params(body: str) -> dict[str, tuple[set[str], set[str]]]:
    """méthode → (params nommés acceptés, params nommés requis).

    On ne retient que les DÉCLARATIONS de premier niveau (profondeur
    d'accolades 0 dans le corps de classe) : sinon les appels internes
    seraient pris pour des méthodes de la classe.
    """
    out: dict[str, tuple[set[str], set[str]]] = {}
    depths = brace_depths(body)
    for m in METHOD_SIG.finditer(body):
        name = m.group(1)
        if name in NOT_METHODS:
            continue
        if depths[m.start()] != 0:
            continue
        paren = body.index("(", m.end() - 1)
        params = balanced_slice(body, paren)
        # Une déclaration est suivie d'un corps ou d'une expression :
        # `{`, `=>`, ou `async`. Un appel, lui, est suivi d'autre chose.
        after = body[paren + len(params) + 2 :].lstrip()
        if not (after.startswith("{") or after.startswith("=>")
                or after.startswith("async") or after.startswith("sync")):
            continue
        accepted: set[str] = set()
        required: set[str] = set()
        brace = params.find("{")
        if brace >= 0:
            named = balanced_slice(params, brace, "{", "}")
            for chunk in split_top(named):
                chunk = chunk.strip()
                if not chunk:
                    continue
                is_required = chunk.startswith("required ")
                decl = chunk.removeprefix("required ").strip()
                # Retire une valeur par défaut éventuelle.
                decl = decl.split("=")[0].strip()
                pname = decl.split()[-1].lstrip(".") if decl.split() else ""
                if pname:
                    accepted.add(pname)
                    if is_required:
                        required.add(pname)
        out[name] = (accepted, required)
    return out


def brace_depths(text: str) -> list[int]:
    """Profondeur d'accolades à chaque position (0 = niveau classe)."""
    depths, depth = [], 0
    for c in text:
        if c == "}":
            depth -= 1
        depths.append(depth)
        if c == "{":
            depth += 1
    return depths


def split_top(text: str) -> list[str]:
    """Découpe sur les virgules de niveau supérieur."""
    parts, depth, current = [], 0, []
    for c in text:
        if c in "([{<":
            depth += 1
        elif c in ")]}>":
            depth -= 1
        if c == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(c)
    parts.append("".join(current))
    return parts


def named_args(call: str) -> set[str]:
    """Noms des arguments nommés d'un appel."""
    out = set()
    for chunk in split_top(call):
        m = re.match(r"\s*(\w+)\s*:", chunk)
        if m:
            out.add(m.group(1))
    return out


def check_api_client() -> None:
    api_path = LIB / "data" / "network" / "api_client.dart"
    source = strip_comments(api_path.read_text(encoding="utf-8"))
    body = class_body(source, "ApiClient")
    if body is None:
        fail("classe ApiClient introuvable")
        return
    sigs = method_named_params(body)
    known = set(sigs)

    # Membres hérités/utilitaires qu'on ne modélise pas.
    ignore = {"raw", "baseUrl"}

    # Les porteurs d'ApiClient rencontrés dans le code : champ `api`,
    # champ privé `_api`, et lecture directe du provider Riverpod.
    # Ne matcher que `api.` laissait passer la majorité des appels.
    call_re = re.compile(
        r"(?:\b_?api(?:Client)?|\bref\.(?:read|watch)\(\s*apiClientProvider\s*\))"
        r"\.(\w+)\s*\(",
    )
    for path in sorted(LIB.rglob("*.dart")):
        if path == api_path:
            continue
        rel = path.relative_to(MOBILE).as_posix()
        text = strip_comments(path.read_text(encoding="utf-8"))
        for m in call_re.finditer(text):
            name = m.group(1)
            if name in ignore:
                continue
            line = text.count("\n", 0, m.start()) + 1
            if name not in known:
                fail(f"{rel}:{line} : ApiClient n'a pas de méthode « {name} »")
                continue
            accepted, required = sigs[name]
            call = balanced_slice(text, m.end() - 1)
            provided = named_args(call)
            for extra in sorted(provided - accepted):
                fail(
                    f"{rel}:{line} : `api.{name}(…)` — paramètre nommé "
                    f"« {extra} » inexistant"
                )
            for missing in sorted(required - provided):
                fail(
                    f"{rel}:{line} : `api.{name}(…)` — paramètre requis "
                    f"« {missing} » manquant"
                )


def check_app_container() -> None:
    path = LIB / "core" / "container" / "app_container.dart"
    source = strip_comments(path.read_text(encoding="utf-8"))
    body = class_body(source, "AppContainer")
    if body is None:
        fail("classe AppContainer introuvable")
        return
    members = set(re.findall(r"\b(?:late\s+)?final\s+[\w<>,\s?]+\s+(\w+)\s*[=;]", body))
    members |= set(re.findall(r"\bfinal\s+(\w+)\s*;", body))
    members |= {"database", "apiBaseUrl"}

    call_re = re.compile(r"\bcontainer\.(\w+)")
    for dart in sorted(LIB.rglob("*.dart")):
        if dart == path:
            continue
        rel = dart.relative_to(MOBILE).as_posix()
        text = strip_comments(dart.read_text(encoding="utf-8"))
        for m in call_re.finditer(text):
            name = m.group(1)
            line = text.count("\n", 0, m.start()) + 1
            if name not in members:
                fail(f"{rel}:{line} : AppContainer n'expose pas « {name} »")


def check_providers() -> None:
    # Les providers ne vivent pas tous dans providers.dart :
    # `routerProvider` est déclaré dans app/router.dart, au plus près de
    # ce qu'il construit. On collecte donc dans tout lib/.
    declared: set[str] = set()
    for dart in LIB.rglob("*.dart"):
        text = strip_comments(dart.read_text(encoding="utf-8"))
        declared |= set(re.findall(r"^final\s+(\w+Provider)\s*=", text, re.M))
        declared |= set(re.findall(r"^final\s+(\w+)\s*=\s*(?:Provider|FutureProvider|StreamProvider|NotifierProvider|AsyncNotifierProvider|StateProvider)", text, re.M))

    use_re = re.compile(r"\bref\.(?:read|watch|listen|invalidate)\(\s*(\w+)\b")
    for dart in sorted(LIB.rglob("*.dart")) + sorted(MOBILE.rglob("test/**/*.dart")):
        rel = dart.relative_to(MOBILE).as_posix()
        text = strip_comments(dart.read_text(encoding="utf-8"))
        local = set(re.findall(r"^final\s+(\w+)\s*=", text, re.M))
        for m in use_re.finditer(text):
            name = m.group(1)
            line = text.count("\n", 0, m.start()) + 1
            if name not in declared and name not in local:
                fail(f"{rel}:{line} : provider « {name} » non déclaré")


def check_test_imports() -> None:
    """Les imports `package:medanki_dz/...` des tests pointent-ils vers
    des fichiers réels, et les symboles listés dans un `show` y
    existent-ils ?

    Un test qui référence un symbole absent ne « échoue » pas : il ne
    COMPILE pas, et tout le fichier disparaît silencieusement de la
    suite. Sans SDK Dart ici, c'est invisible.

    On se limite volontairement aux `show` explicites : tenter de
    résoudre TOUS les identifiants d'un test produit un bruit
    ingérable (noms de tests en français, variables locales
    appelables…). Une garde bruyante finit ignorée ; mieux vaut une
    garde étroite et fiable.
    """
    tests = sorted((MOBILE / "test").rglob("*.dart"))
    import_re = re.compile(
        r"import\s+'package:medanki_dz/([^']+)'(?:\s+show\s+([^;]+))?;"
    )
    for test in tests:
        rel = test.relative_to(MOBILE).as_posix()
        text = test.read_text(encoding="utf-8")
        for m in import_re.finditer(text):
            target, shown = m.group(1), m.group(2)
            line = text.count("\n", 0, m.start()) + 1
            path = LIB / target
            if not path.exists():
                fail(f"{rel}:{line} : import « package:medanki_dz/{target} » sans fichier")
                continue
            if not shown:
                continue
            source = strip_comments(path.read_text(encoding="utf-8"))
            declared = set(re.findall(r"\b(?:class|enum|mixin|extension|typedef)\s+(\w+)", source))
            declared |= set(re.findall(r"^(?:const|final)\s+(?:[\w<>,\s?]+\s+)?(\w+)\s*=", source, re.M))
            declared |= set(re.findall(r"^(?:[\w<>,\s?]+?)\s(\w+)\s*\(", source, re.M))
            # Les barrels ré-exportent : on ne peut pas trancher.
            if "export " in source:
                continue
            for symbol in (s.strip() for s in shown.split(",")):
                if symbol and symbol not in declared:
                    fail(
                        f"{rel}:{line} : « {symbol} » n'est pas déclaré par "
                        f"{target}"
                    )


def main() -> int:
    if not LIB.exists():
        print(f"❌ {LIB} introuvable")
        return 1
    check_api_client()
    check_app_container()
    check_providers()
    check_test_imports()

    for f in failures:
        print(f"  ❌ {f}")
    if failures:
        print(f"\n❌ Symboles Dart : {len(failures)} problème(s).")
        return 1
    print(
        "✅ Symboles Dart résolus (ApiClient, AppContainer, providers "
        "Riverpod, imports des tests)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
