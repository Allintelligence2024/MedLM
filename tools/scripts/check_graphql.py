#!/usr/bin/env python3
"""
check_graphql.py — cohérence du gateway GraphQL v2 (Phase 20.2).

Verrous :
  * chaque opération persistée a un nom, un coût > 0, une SDL commençant
    par `query <Name>`, et figure dans le schéma documentaire ;
  * le chemin REST de délégation de chaque opération EXISTE réellement
    dans un contrôleur NestJS (revu à chaque refactor de routes) ;
  * v1 = lecture seule : aucune mutation, REST en GET uniquement ;
  * le controller est gardé (JwtGuard), le body est validé par Zod,
    et le feature flag GRAPHQL_ENABLED est câblé.

Usage : python3 tools/scripts/check_graphql.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GW = ROOT / "backend" / "src" / "gateway"
CONTROLLERS = list((ROOT / "backend" / "src").rglob("*.controller.ts"))

# Chaque chemin REST de délégation → motifs qui doivent exister dans le
# code des contrôleurs (préfixe @Controller + verbe @Get).
DELEGATION_PATHS = {
    "/stats/me": [r"@Controller\('stats'\)", r"@Get\('me'\)"],
    "/content/decks": [r"@Controller\('content'\)", r"@Get\('decks'\)"],
    "/ai/adaptive/profile": [r"@Controller\('ai/adaptive'\)", r"@Get\('profile'\)"],
    "/exams/templates": [r"@Controller\('exams'\)", r"@Get\('templates'\)"],
    "/gamification/leaderboard": [
        r"@Controller\('gamification/leaderboard'\)", r"@Get\(\)"],
}


def main() -> int:
    failures: list[str] = []

    po = (GW / "persisted-operations.ts").read_text(encoding="utf-8")
    sdl = (GW / "schema.graphql").read_text(encoding="utf-8")
    ctrl = (GW / "gateway.controller.ts").read_text(encoding="utf-8")
    all_controllers = "\n".join(p.read_text(encoding="utf-8") for p in CONTROLLERS)

    # 1. Opérations persistées : nom + coût + SDL + entrée dans le
    #    schéma documentaire.
    names = re.findall(r"name:\s*'(\w+)',", po)
    costs = re.findall(r"cost:\s*(\d+),", po)
    if len(names) < 5:
        failures.append(f"au moins 5 opérations attendues, trouvé {names}")
    if len(costs) != len(names) or any(int(c) <= 0 for c in costs):
        failures.append(f"coûts invalides : {costs}")
    seen = set()
    for name in names:
        if name in seen:
            failures.append(f"opération dupliquée : {name}")
        seen.add(name)
        if not re.search(rf"sdl:\s*'query {name}[ (]", po):
            failures.append(f"{name} : la SDL ne commence pas par 'query {name}'")
        if f"query {name}" not in sdl:
            failures.append(f"{name} : absente de schema.graphql (doc)")
    if "type Query" not in sdl:
        failures.append("schema.graphql : bloc type Query absent")
    if "type Mutation" in sdl:
        failures.append("v1 doit rester lecture seule (type Mutation interdit)")
    if "mutation " in po:
        failures.append("persisted-operations.ts : mutation interdite en v1")

    # 2. Chaque chemin de délégation existe réellement côté REST.
    for path, patterns in DELEGATION_PATHS.items():
        if f"path: '{path}'" not in po:
            failures.append(f"délégation {path} absente de persisted-operations.ts")
        for pat in patterns:
            if not re.search(pat, all_controllers):
                failures.append(f"délégation {path} : motif {pat} introuvable dans les contrôleurs")
    declared = set(re.findall(r"path:\s*'(/[\w/-]+)'", po))
    unknown = declared - set(DELEGATION_PATHS)
    if unknown:
        failures.append(f"chemins de délégation non recensés : {sorted(unknown)}")

    # 3. REST en GET uniquement.
    if re.search(r"method:\s*'(?!GET')", po):
        failures.append("délégation non-GET détectée")

    # 4. Controller gardé + Zod + feature flag.
    if "@UseGuards(JwtGuard)" not in ctrl:
        failures.append("gateway.controller.ts : @UseGuards(JwtGuard) manquant")
    if "GraphqlGatewayBody.parse" not in ctrl:
        failures.append("gateway.controller.ts : validation Zod du body absente")
    if "GRAPHQL_ENABLED" not in ctrl:
        failures.append("gateway.controller.ts : feature flag GRAPHQL_ENABLED absent")
    if "SERVICE_UNAVAILABLE" not in ctrl:
        failures.append("gateway.controller.ts : 503 quand flag OFF absent")

    if failures:
        print(f"❌ {len(failures)} problème(s) gateway GraphQL :")
        for f in failures:
            print("  -", f)
        return 1
    print(f"✅ Gateway GraphQL cohérent ({len(names)} opérations persistées, "
          "délégations vérifiées, lecture seule, gardé).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
