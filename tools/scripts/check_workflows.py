#!/usr/bin/env python3
"""Validation des workflows GitHub Actions (audit P0-3).

Les workflows ne peuvent pas être exécutés ici, et ils sont même en
attente d'installation (`ci/workflows/`, faute de permission
`workflows` — cf. ci/README.md). Ils ne seront donc exercés qu'après une
action manuelle : autant s'assurer maintenant qu'ils ne casseront pas
sur une faute de frappe.

Vérifications :
  1. YAML valide, `on:` et `jobs:` présents, chaque job a des `steps` ;
  2. tout script invoqué (`python3 tools/…`, `./tools/…`) existe ;
  3. les `working-directory` pointent vers des dossiers réels ;
  4. les `npm run <script>` existent dans le package.json correspondant ;
  5. les `needs:` référencent des jobs déclarés ;
  6. aucun secret en dur (les valeurs sensibles passent par `secrets.`).

Ce script tolère l'absence des workflows (dépôt sans CI) mais échoue
dès qu'un fichier présent est incohérent.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Les workflows vivent dans ci/workflows/ tant que l'app GitHub n'a pas
# la permission de les écrire sous .github/ (cf. ci/README.md).
CANDIDATE_DIRS = [ROOT / ".github" / "workflows", ROOT / "ci" / "workflows"]

failures: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


SCRIPT_RE = re.compile(r"(?:python3?\s+|bash\s+|sh\s+|\./)((?:tools|scripts)/[\w./-]+)")
NPM_RUN_RE = re.compile(r"npm\s+run\s+([\w:-]+)")
# Un secret en dur ressemble à `KEY: "valeur longue"` sans ${{ }}.
HARDCODED_SECRET_RE = re.compile(
    r"^\s*(\w*(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY)\w*)\s*:\s*(.+)$",
    re.I,
)
# Valeurs manifestement inoffensives (placeholders de test).
SAFE_SECRET_VALUES = {
    "", "''", '""', "e2e-test-key-do-not-use-in-prod", "medanki",
}


def npm_scripts(package_dir: Path) -> set[str]:
    pkg = package_dir / "package.json"
    if not pkg.exists():
        return set()
    try:
        return set((json.loads(pkg.read_text(encoding="utf-8")).get("scripts") or {}))
    except json.JSONDecodeError:
        return set()


def check_workflow(path: Path, yaml_mod) -> None:
    rel = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")

    try:
        doc = yaml_mod.safe_load(text) or {}
    except yaml_mod.YAMLError as e:
        fail(f"{rel} : YAML invalide ({e})")
        return

    # `on:` est lu comme le booléen True par YAML 1.1 — ce n'est pas une
    # erreur, mais il faut le savoir pour le retrouver.
    if "on" not in doc and True not in doc:
        fail(f"{rel} : pas de déclencheur `on:`")

    jobs = doc.get("jobs") or {}
    if not jobs:
        fail(f"{rel} : aucun job")
        return

    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            fail(f"{rel} : job « {job_name} » mal formé")
            continue
        if not job.get("runs-on"):
            fail(f"{rel} : job « {job_name} » sans `runs-on`")
        steps = job.get("steps") or []
        if not steps:
            fail(f"{rel} : job « {job_name} » sans `steps`")

        for need in as_list(job.get("needs")):
            if need not in jobs:
                fail(f"{rel} : job « {job_name} » dépend de « {need} », non déclaré")

        # `defaults.run.working-directory` au niveau du workflow ou du job.
        job_wd = (
            (job.get("defaults") or {}).get("run", {}).get("working-directory")
            or (doc.get("defaults") or {}).get("run", {}).get("working-directory")
            or "."
        )

        for i, step in enumerate(steps, 1):
            if not isinstance(step, dict):
                fail(f"{rel} : {job_name}[{i}] mal formé")
                continue
            if not step.get("uses") and not step.get("run"):
                fail(f"{rel} : {job_name}[{i}] n'a ni `uses` ni `run`")

            wd = step.get("working-directory") or job_wd
            wd_path = ROOT / wd
            if not wd_path.is_dir():
                fail(
                    f"{rel} : {job_name}[{i}] — working-directory « {wd} » "
                    "n'existe pas"
                )
                continue

            run = step.get("run")
            if not isinstance(run, str):
                continue

            for script in SCRIPT_RE.findall(run):
                # Les scripts du dépôt sont toujours résolus depuis la
                # racine (les steps concernés posent working-directory: .).
                if not (ROOT / script).exists():
                    fail(
                        f"{rel} : {job_name}[{i}] — script « {script} » introuvable"
                    )

            for target in NPM_RUN_RE.findall(run):
                # `cd x && npm run y` : on suit le cd s'il est explicite.
                cd = re.search(r"cd\s+([\w./-]+)\s*&&[^&]*npm\s+run\s+" + re.escape(target), run)
                base = ROOT / (cd.group(1) if cd else wd)
                scripts = npm_scripts(base)
                if scripts and target not in scripts:
                    fail(
                        f"{rel} : {job_name}[{i}] — `npm run {target}` absent de "
                        f"{base.relative_to(ROOT) if base != ROOT else '.'}/package.json"
                    )

    # Secrets en dur.
    for lineno, line in enumerate(text.splitlines(), 1):
        m = HARDCODED_SECRET_RE.match(line)
        if not m:
            continue
        value = m.group(2).strip()
        if "${{" in value or value in SAFE_SECRET_VALUES:
            continue
        # Une valeur entre guillemets manifestement factice reste tolérée
        # si elle le dit elle-même.
        if "test" in value.lower() or "example" in value.lower():
            continue
        fail(f"{rel}:{lineno} : « {m.group(1)} » semble contenir un secret en dur")


def as_list(value) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def main() -> int:
    try:
        import yaml  # type: ignore[import-untyped]
    except ModuleNotFoundError:
        print("⏭  PyYAML absent — validation des workflows ignorée")
        return 0

    files: list[Path] = []
    for d in CANDIDATE_DIRS:
        if d.is_dir():
            files.extend(sorted(d.glob("*.yml")) + sorted(d.glob("*.yaml")))

    if not files:
        print("⏭  aucun workflow à valider")
        return 0

    for f in files:
        check_workflow(f, yaml)

    installed = (ROOT / ".github" / "workflows").is_dir()
    if not installed:
        warnings.append(
            "workflows encore dans ci/workflows/ — à déplacer vers "
            ".github/workflows/ pour qu'ils s'exécutent (cf. ci/README.md)"
        )

    for w in warnings:
        print(f"  ⚠  {w}")
    for f in failures:
        print(f"  ❌ {f}")
    if failures:
        print(f"\n❌ Workflows : {len(failures)} problème(s).")
        return 1
    print(
        f"✅ Workflows valides ({len(files)} fichiers : jobs, dépendances, "
        "scripts, working-directory, npm run, 0 secret en dur)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
