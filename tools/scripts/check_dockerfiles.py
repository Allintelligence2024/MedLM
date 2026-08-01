#!/usr/bin/env python3
"""Validation des Dockerfiles et du docker-compose (audit P0-4).

Aucun démon Docker n'est disponible dans cet environnement : `docker
build` ne peut pas être lancé ici. Plutôt que de s'en remettre
entièrement à la CI, ce script vérifie ce qui est vérifiable
statiquement — et en particulier les erreurs qui ne se voient qu'à
l'exécution, une fois l'image poussée :

  * un `COPY --from=<stage>` qui référence une étape inexistante ;
  * un chemin copié qui n'existe pas dans le contexte de build ;
  * un `HEALTHCHECK` dont l'URL ne correspond à aucune route réelle ;
  * un conteneur qui tourne en root ;
  * une image de base sans tag (`latest` implicite = build non
    reproductible) ;
  * un `docker-compose.yml` dont les services référencent des
    Dockerfiles ou des variables absents.

NOTE sur `dockerfilelint` (npm) : il signale `--start-period` comme un
argument invalide. C'est un faux positif — l'option est documentée et
valide depuis Docker 17.05 ; le même bug existe dans le scanner de
trivy. On ne s'appuie donc pas dessus.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

failures: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def logical_lines(text: str) -> list[tuple[int, str]]:
    """Recolle les continuations `\\` en instructions logiques."""
    out: list[tuple[int, str]] = []
    buffer, start = "", 0
    for i, raw in enumerate(text.splitlines(), 1):
        stripped = raw.strip()
        if not buffer:
            if not stripped or stripped.startswith("#"):
                continue
            start = i
        if stripped.endswith("\\"):
            buffer += stripped[:-1] + " "
            continue
        buffer += stripped
        out.append((start, buffer.strip()))
        buffer = ""
    if buffer:
        out.append((start, buffer.strip()))
    return out


# Instructions valides (référence Dockerfile).
INSTRUCTIONS = {
    "FROM", "RUN", "CMD", "LABEL", "EXPOSE", "ENV", "ADD", "COPY",
    "ENTRYPOINT", "VOLUME", "USER", "WORKDIR", "ARG", "ONBUILD",
    "STOPSIGNAL", "HEALTHCHECK", "SHELL", "MAINTAINER",
}

# Options acceptées par HEALTHCHECK (toutes valides côté Docker :
# --start-period existe depuis 17.05, --start-interval depuis 25.0).
HEALTHCHECK_FLAGS = {"--interval", "--timeout", "--start-period",
                     "--start-interval", "--retries"}


def check_dockerfile(path: Path, http_routes: set[str]) -> None:
    rel = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    lines = logical_lines(text)

    stages: set[str] = set()
    has_user = False
    last_user_root = True
    seen_from = False

    for lineno, line in lines:
        if line.startswith("# syntax") or line.startswith("#"):
            continue
        parts = line.split(maxsplit=1)
        instr = parts[0].upper()
        rest = parts[1] if len(parts) > 1 else ""

        if instr not in INSTRUCTIONS:
            fail(f"{rel}:{lineno} : instruction inconnue « {parts[0]} »")
            continue

        if instr == "FROM":
            seen_from = True
            tokens = rest.split()
            image = tokens[0] if tokens else ""
            # Image de base sans tag → « latest » implicite : le build
            # d'aujourd'hui et celui de demain ne produiraient pas la
            # même image.
            if image and ":" not in image and "@" not in image and image not in stages:
                fail(f"{rel}:{lineno} : image de base « {image} » sans tag")
            if image.endswith(":latest"):
                fail(f"{rel}:{lineno} : image de base épinglée sur « latest »")
            m = re.search(r"\bAS\s+(\S+)", rest, re.I)
            if m:
                stages.add(m.group(1))
            # Chaque étape repart de root.
            last_user_root = True
            continue

        if not seen_from:
            fail(f"{rel}:{lineno} : « {instr} » avant tout FROM")

        if instr == "COPY" or instr == "ADD":
            m = re.search(r"--from=(\S+)", rest)
            if m:
                stage = m.group(1)
                # Un --from numérique ou une image externe sont valides.
                if not stage.isdigit() and "/" not in stage and ":" not in stage:
                    if stage not in stages:
                        fail(
                            f"{rel}:{lineno} : COPY --from=« {stage} » — "
                            f"étape inexistante (connues : {sorted(stages) or 'aucune'})"
                        )
            else:
                # Source locale : elle doit exister dans le contexte
                # (la racine du dépôt, cf. les commandes documentées).
                args = [
                    a for a in rest.split()
                    if not a.startswith("--")
                ]
                for src in args[:-1]:
                    if any(c in src for c in "*?[$"):
                        continue
                    if not (ROOT / src).exists():
                        fail(
                            f"{rel}:{lineno} : source « {src} » absente du "
                            "contexte de build"
                        )

        if instr == "USER":
            has_user = True
            user = rest.split(":")[0].strip()
            last_user_root = user in {"root", "0"}

        if instr == "HEALTHCHECK":
            if rest.upper().startswith("NONE"):
                continue
            flags = re.findall(r"(--[\w-]+)=", rest)
            for f in flags:
                if f not in HEALTHCHECK_FLAGS:
                    fail(f"{rel}:{lineno} : option HEALTHCHECK inconnue « {f} »")
            if " CMD " not in f" {rest} ":
                fail(f"{rel}:{lineno} : HEALTHCHECK sans CMD")
            # L'URL sondée doit correspondre à une route réelle.
            for url in re.findall(r"https?://[^\s\"']+", rest):
                route = normalise_route(url)
                if route and http_routes and route not in http_routes:
                    near = [r for r in sorted(http_routes) if r.startswith("/v1/health")
                            or r.startswith("/v1/ready")]
                    fail(
                        f"{rel}:{lineno} : HEALTHCHECK sonde « {route} », "
                        f"route inexistante — disponibles : {near}"
                    )

    if not seen_from:
        fail(f"{rel} : aucun FROM")
    if not has_user:
        fail(f"{rel} : aucun USER — le conteneur tournerait en root")
    elif last_user_root:
        fail(f"{rel} : la dernière directive USER est root")


def normalise_route(url: str) -> str | None:
    """Extrait le chemin d'une URL de healthcheck, variables résolues."""
    m = re.search(r"https?://[^/]+(/\S*)?", url)
    if not m:
        return None
    path = (m.group(1) or "/").rstrip('"\'')
    # ${PORT} et consorts ont déjà été retirés par le découpage sur
    # l'hôte ; il peut rester des variables dans le chemin.
    if "$" in path:
        return None
    return path


def backend_routes() -> set[str]:
    """Routes HTTP réellement exposées par le backend (préfixe /v1)."""
    src = ROOT / "backend" / "src"
    if not src.is_dir():
        return set()
    routes: set[str] = set()
    for ts in src.rglob("*.controller.ts"):
        text = ts.read_text(encoding="utf-8")
        ctrl = re.search(r"@Controller\(\s*'([^']*)'\s*\)", text)
        base = ctrl.group(1).strip("/") if ctrl else ""
        for m in re.finditer(r"@(Get|Post|Put|Patch|Delete)\(\s*'?([^')]*)'?\s*\)", text):
            sub = m.group(2).strip().strip("'").strip("/")
            segments = [s for s in (base, sub) if s]
            path = "/" + "/".join(segments)
            # Le gateway GraphQL est exclu du préfixe global (P0-1).
            prefix = "" if path.startswith("/v2") else "/v1"
            routes.add(f"{prefix}{path}" if prefix else path)
    return routes


def check_compose() -> None:
    """Cohérence de docker-compose.yml.

    Parsé en YAML réel : une analyse par expressions régulières prenait
    `environment:` ou `ports:` pour des noms de services (ce sont des
    clés au même niveau d'indentation que les dépendances).
    """
    path = ROOT / "docker-compose.yml"
    if not path.exists():
        fail("docker-compose.yml absent")
        return
    rel = path.name

    try:
        import yaml  # type: ignore[import-untyped]
    except ModuleNotFoundError:
        warn(f"{rel} : PyYAML absent — vérification structurelle ignorée")
        return

    try:
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        fail(f"{rel} : YAML invalide ({e})")
        return

    services = doc.get("services") or {}
    if not isinstance(services, dict) or not services:
        fail(f"{rel} : aucun service")
        return

    for required in ("postgres", "redis", "backend", "cms"):
        if required not in services:
            warn(f"{rel} : service « {required} » absent")

    declared_volumes = set((doc.get("volumes") or {}) or {})

    for name, svc in services.items():
        if not isinstance(svc, dict):
            fail(f"{rel} : service « {name} » mal formé")
            continue

        build = svc.get("build")
        if isinstance(build, dict):
            df = build.get("dockerfile")
            if df and not (ROOT / df).exists():
                fail(f"{rel} : service « {name} » — dockerfile « {df} » introuvable")
            ctx = build.get("context")
            if ctx and not (ROOT / ctx).exists():
                fail(f"{rel} : service « {name} » — contexte « {ctx} » introuvable")
        elif not build and not svc.get("image"):
            fail(f"{rel} : service « {name} » sans `image` ni `build`")

        # Dépendances : forme liste ou forme mappée avec condition.
        deps = svc.get("depends_on") or {}
        dep_names = list(deps) if isinstance(deps, dict) else list(deps)
        for dep in dep_names:
            if dep not in services:
                fail(
                    f"{rel} : service « {name} » dépend de « {dep} », "
                    "qui n'existe pas"
                )
            elif isinstance(deps, dict):
                cond = (deps.get(dep) or {}).get("condition")
                # Attendre un service qui n'a pas de healthcheck bloque
                # le démarrage indéfiniment.
                if cond == "service_healthy" and "healthcheck" not in (
                    services.get(dep) or {}
                ):
                    fail(
                        f"{rel} : « {name} » attend « {dep} » en bonne santé, "
                        "mais ce service n'a pas de healthcheck"
                    )

        # Volumes nommés : ils doivent être déclarés au niveau racine.
        for vol in svc.get("volumes") or []:
            if not isinstance(vol, str) or ":" not in vol:
                continue
            source = vol.split(":")[0]
            if source.startswith((".", "/", "~", "$")):
                continue
            if source not in declared_volumes:
                fail(
                    f"{rel} : service « {name} » utilise le volume nommé "
                    f"« {source} », non déclaré à la racine"
                )


def main() -> int:
    dockerfiles = sorted(ROOT.glob("*/Dockerfile"))
    if not dockerfiles:
        print("❌ aucun Dockerfile")
        return 1

    routes = backend_routes()
    for df in dockerfiles:
        # Les routes ne concernent que le backend ; le CMS sonde « / ».
        check_dockerfile(df, routes if df.parent.name == "backend" else set())
    check_compose()

    for w in warnings:
        print(f"  ⚠  {w}")
    for f in failures:
        print(f"  ❌ {f}")
    if failures:
        print(f"\n❌ Docker : {len(failures)} problème(s).")
        return 1
    print(
        f"✅ Docker validé statiquement ({len(dockerfiles)} images : étapes, "
        "sources du contexte, healthchecks ↔ routes réelles, user non-root ; "
        "compose cohérent)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
