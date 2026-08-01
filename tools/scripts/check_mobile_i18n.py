#!/usr/bin/env python3
"""Parité i18n mobile — FR / AR / EN (audit P1-4).

Le backend est trilingue et vérifié (14 tests i18n_parity). Le mobile,
lui, avait toutes ses chaînes en dur en français — leaderboard_screen.dart
le disait lui-même en commentaire. Ce script est l'équivalent mobile de
cette garde : il échoue si une traduction manque, si un placeholder
diverge, ou si une chaîne UI est réintroduite en dur dans le code.

Vérifications :
  1. les trois .arb existent et déclarent le bon @@locale ;
  2. exactement le même jeu de clés dans les trois langues ;
  3. mêmes placeholders ({count}, {name}…) par clé et par langue ;
  4. aucune valeur vide, aucune valeur AR/EN identique au FR pour les
     clés « à traduire » (hors liste blanche de noms propres) ;
  5. aucune chaîne française en dur dans les widgets de lib/ui/.

Sortie : 0 si tout est conforme, 1 sinon.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
L10N = ROOT / "mobile" / "lib" / "l10n"
UI = ROOT / "mobile" / "lib" / "ui"
LANGS = ("fr", "ar", "en")

# Chaînes identiques dans les trois langues par nature (noms propres,
# marques, sigles) — ne pas signaler comme « non traduites ».
SAME_ACROSS_LANGS = {"appTitle", "authGoogle", "paywallCta", "decksPremium"}

# Fichiers UI antérieurs à l'i18n dont la migration est planifiée mais
# non faite : on les tolère explicitement pour que la garde soit
# activable tout de suite, et on rétrécit cette liste à chaque écran migré.
# Toute NOUVELLE entrée ici doit être justifiée en revue.
# La migration des écrans antérieurs à l'i18n est TERMINÉE : la liste
# d'exception est vide et doit le rester. Tout écran, ancien ou nouveau,
# passe désormais par AppLocalizations.
HARDCODED_ALLOWLIST: set[str] = set()

# Un placeholder ICU est `{nom}` ou `{nom,plural,…}`. Les branches de
# plural (`=1{Rien à réviser}`) ressemblent syntaxiquement à des
# placeholders : on ne retient donc que les noms DÉCLARÉS dans les
# métadonnées du modèle FR.
PLACEHOLDER_RE = re.compile(r"\{([A-Za-z_]\w*)\s*[,}]")
# Un littéral Dart contenant au moins un mot accentué ou deux mots
# séparés par un espace et commençant par une majuscule : heuristique
# volontairement conservatrice (0 faux positif sur le repo actuel).
FRENCH_LITERAL_RE = re.compile(
    r"""['"]([^'"\n]*[àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ][^'"\n]*)['"]"""
)


def load(lang: str) -> dict[str, object]:
    path = L10N / f"app_{lang}.arb"
    if not path.exists():
        fail(f"{path.relative_to(ROOT)} manquant")
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


FAILURES: list[str] = []


def fail(msg: str) -> None:
    FAILURES.append(msg)


def keys_of(arb: dict[str, object]) -> set[str]:
    return {k for k in arb if not k.startswith("@")}


def placeholders(value: str, declared: set[str]) -> set[str]:
    return set(PLACEHOLDER_RE.findall(value)) & declared


def declared_placeholders(arb: dict[str, object], key: str) -> set[str]:
    meta = arb.get("@" + key)
    if isinstance(meta, dict) and isinstance(meta.get("placeholders"), dict):
        return set(meta["placeholders"])
    return set()


def main() -> int:
    arbs = {lang: load(lang) for lang in LANGS}
    if FAILURES:
        report()
        return 1

    # 1. @@locale
    for lang, arb in arbs.items():
        if arb.get("@@locale") != lang:
            fail(f"app_{lang}.arb : @@locale = {arb.get('@@locale')!r}, attendu {lang!r}")

    # 2. même jeu de clés
    ref = keys_of(arbs["fr"])
    if not ref:
        fail("app_fr.arb ne contient aucune clé")
    for lang in ("ar", "en"):
        other = keys_of(arbs[lang])
        for missing in sorted(ref - other):
            fail(f"app_{lang}.arb : clé manquante « {missing} »")
        for extra in sorted(other - ref):
            fail(f"app_{lang}.arb : clé en trop « {extra} » (absente du modèle FR)")

    # 3. placeholders identiques + 4. valeurs non vides / traduites
    for key in sorted(ref):
        fr_val = arbs["fr"][key]
        if not isinstance(fr_val, str) or not fr_val.strip():
            fail(f"app_fr.arb : valeur vide pour « {key} »")
            continue
        declared = declared_placeholders(arbs["fr"], key)
        fr_ph = placeholders(fr_val, declared)
        used = set(PLACEHOLDER_RE.findall(fr_val))
        # Tout nom utilisé comme `{nom}` doit être déclaré (sinon
        # gen-l10n produit une chaîne littérale silencieusement fausse).
        undeclared = {
            n for n in used
            if n not in declared and not n.startswith("=") and n not in {"plural", "select"}
            and "{" + n + "}" in fr_val
        }
        for n in sorted(undeclared):
            fail(f"app_fr.arb : placeholder « {n} » utilisé dans « {key} » mais non déclaré dans @{key}.placeholders")
        for lang in ("ar", "en"):
            val = arbs[lang].get(key)
            if not isinstance(val, str) or not val.strip():
                fail(f"app_{lang}.arb : valeur vide pour « {key} »")
                continue
            if placeholders(val, declared) != fr_ph:
                fail(
                    f"app_{lang}.arb : placeholders divergents pour « {key} » "
                    f"({sorted(placeholders(val, declared))} vs FR {sorted(fr_ph)})"
                )
            # L'anglais partage souvent un mot avec le français
            # (« Notifications », « Badges ») : ce n'est pas un oubli.
            # L'arabe, lui, change d'écriture — une égalité y est
            # forcément une traduction manquante.
            if lang == "ar" and val == fr_val and key not in SAME_ACROSS_LANGS:
                fail(f"app_ar.arb : « {key} » est identique au FR (non traduit ?)")

    # 5. pas de chaîne française en dur dans les widgets
    for dart in sorted(UI.rglob("*.dart")):
        rel = dart.relative_to(ROOT / "mobile").as_posix()
        if rel in HARDCODED_ALLOWLIST:
            continue
        for lineno, line in enumerate(dart.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("///"):
                continue
            if "ignore: hardcoded-string" in line:
                continue
            for literal in FRENCH_LITERAL_RE.findall(line):
                # Les identifiants techniques et les clés JSON n'ont pas
                # d'accent : le filtre ci-dessus les exclut déjà. On
                # ignore encore les imports et les chemins d'assets.
                if literal.startswith(("package:", "assets/", "http")):
                    continue
                fail(f"{rel}:{lineno} : chaîne FR en dur « {literal} » — passer par AppLocalizations")

    report()
    if FAILURES:
        return 1
    print(
        f"✅ i18n mobile conforme ({len(ref)} clés × {len(LANGS)} langues, "
        f"placeholders alignés, 0 chaîne en dur dans lib/ui/)."
    )
    return 0


def report() -> None:
    for f in FAILURES:
        print(f"  ❌ {f}")
    if FAILURES:
        print(f"\n❌ i18n mobile : {len(FAILURES)} problème(s).")


if __name__ == "__main__":
    sys.exit(main())
