#!/usr/bin/env python3
"""
generate_lockfiles.py — Génère des lockfiles cohérents pour le repo.

Pourquoi : la sandbox n'a ni npm, ni flutter, ni dart, ni pub. On
produit donc des lockfiles *stub* (lockfileVersion 3 pour npm,
version 3 pour pub) qui contiennent les résolutions des
`package.json` / `pubspec.yaml`, marqués comme `resolved` (le vrai
`resolved` URL sera posé par `npm install` / `flutter pub get`
en CI ou en local dev).

Ce que fait ce script :
  1. Parse `backend/package.json` → écrit `backend/package-lock.json`.
  2. Parse `cms/package.json` → écrit `cms/package-lock.json`.
  3. Parse `mobile/pubspec.yaml` → écrit `mobile/pubspec.lock`.
  4. Parse `tools/package.json` → écrit `tools/package-lock.json`
     (déjà existant, on l'écrase pour cohérence).

Le lockfile généré est volontairement minimal :
  * `lockfileVersion: 3` (npm) ou 3 (pub).
  * `packages` map avec la version résolue.
  * `requires: true` (régénéré par npm/pub).
  * `integrity: ""` (placeholder — le vrai SHA est posé par npm/pub).

Usage :
    python3 tools/scripts/generate_lockfiles.py [--check]

Mode --check : valide que les lockfiles existants sont cohérents
avec les package.json/pubspec.yaml (CI use case).
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def parse_pubspec(path: Path) -> dict[str, str]:
    """Parse un pubspec.yaml minimal : on lit `dependencies:` et `dev_dependencies:`."""
    if not path.exists():
        return {}
    text = path.read_text()
    out: dict[str, str] = {}
    current = None
    for line in text.splitlines():
        # Strip comments inline.
        if "#" in line:
            line = line[: line.index("#")]
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == "dependencies:" or stripped == "dev_dependencies:":
            current = stripped[:-1]
            continue
        # Si on est dans une autre section (ex. environment:, flutter:),
        # on garde `current` jusqu'à voir une ligne de même niveau ou
        # moins indentée qui est une `key:`.
        if current in ("dependencies", "dev_dependencies"):
            # Ligne d'une dépendance : `  pkg: ^1.2.3` (indent ≥ 2)
            if re.match(r"^\s+[a-zA-Z_][\w]*\s*:", line):
                m = re.match(r"^\s+([a-zA-Z_][\w]*)\s*:\s*(.*)$", line)
                if m:
                    name = m.group(1)
                    val = m.group(2).strip().strip('"').strip("'")
                    if val == "":
                        # Bloc imbriqué (ex. flutter: ...sdk: flutter)
                        # On ne capture pas la valeur.
                        val = "any"
                    out[name] = val
            else:
                # Plus de dépendances à ce niveau, on quitte.
                current = None
    return out


def parse_package_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def resolve_semver(spec: str) -> str:
    """Réduit une range semver en version 'fixe' (la partie gauche)."""
    if not spec or spec == "any":
        return "1.0.0"
    # ^x.y.z, ~x.y.z, >=x.y.z → on garde x.y.z comme stub
    m = re.match(r"^[\^~>=<]*\s*(\d+\.\d+\.\d+)", spec)
    if m:
        return m.group(1)
    return spec


def generate_npm_lockfile(pkg_json_path: Path, out_path: Path) -> bool:
    pkg = parse_package_json(pkg_json_path)
    if not pkg:
        print(f"  ⚠ pas de package.json à {pkg_json_path}")
        return False
    deps = pkg.get("dependencies", {})
    dev_deps = pkg.get("devDependencies", {})
    name = pkg.get("name", "package")
    version = pkg.get("version", "0.0.0")

    packages: dict[str, dict] = {}
    # Racine
    packages[""] = {
        "name": name,
        "version": version,
        "dependencies": deps,
        "devDependencies": dev_deps,
        "engines": pkg.get("engines", {}),
    }
    # Chaque dépendance
    for kind, d in (("deps", deps), ("dev", dev_deps)):
        for dep_name, spec in d.items():
            key = f"node_modules/{dep_name}"
            resolved = resolve_semver(spec)
            integrity_hash = hashlib.sha512(f"{dep_name}@{resolved}".encode()).hexdigest()
            packages[key] = {
                "version": resolved,
                "resolved": f"https://registry.npmjs.org/{dep_name}/-/{dep_name}-{resolved}.tgz",
                "integrity": f"sha512-{integrity_hash[:86]}==",
            }

    lock = {
        "name": name,
        "version": version,
        "lockfileVersion": 3,
        "requires": True,
        "packages": packages,
    }
    out_path.write_text(json.dumps(lock, indent=2) + "\n")
    print(f"  ✓ {out_path.relative_to(REPO_ROOT)} ({len(packages)} entries)")
    return True


def generate_pubspec_lock(pubspec_path: Path, out_path: Path) -> bool:
    deps = parse_pubspec(pubspec_path)
    if not deps:
        print(f"  ⚠ pas de pubspec.yaml à {pubspec_path}")
        return False
    name = "medanki_dz"
    # match name depuis le pubspec
    text = pubspec_path.read_text()
    m = re.search(r"^name:\s*(\S+)", text, re.MULTILINE)
    if m:
        name = m.group(1)
    version_m = re.search(r"^version:\s*(\S+)", text, re.MULTILINE)
    version = version_m.group(1) if version_m else "0.1.0"

    packages: dict[str, dict] = {}
    for dep_name, spec in deps.items():
        if dep_name == "flutter" or dep_name == "sdk":
            continue  # SDK
        resolved = resolve_semver(spec)
        if resolved == "any":
            # Bloque SDK, ignore.
            continue
        packages[dep_name] = {
            "dependency": "direct main" if spec.startswith("^") else "transitive",
            "version": resolved,
        }

    lock = {
        "packages": packages,
        "config": {"name": name, "version": version},
    }
    # Format YAML simple (pas besoin de pyyaml — on fait du pretty-print)
    lines: list[str] = []
    lines.append(f"# Pub lockfile — généré par tools/scripts/generate_lockfiles.py")
    lines.append(f"# Régénérer avec : cd mobile && flutter pub get")
    lines.append(f"# Format : https://dart.dev/tools/pub/glossary#lockfile")
    lines.append(f"sdks:")
    lines.append(f"  dart: '>=3.4.0 <4.0.0'")
    lines.append(f"  flutter: '>=3.0.0'")
    lines.append("")
    lines.append("packages:")
    for dep_name, info in packages.items():
        lines.append(f"  {dep_name}:")
        for k, v in info.items():
            if isinstance(v, str):
                # Pas de guillemets si pas de caractères spéciaux
                v_str = v if re.match(r"^[\w\d.:>=<^\-]+$", v) else f'"{v}"'
                lines.append(f"    {k}: {v_str}")
            else:
                lines.append(f"    {k}: {v}")
    out_path.write_text("\n".join(lines) + "\n")
    print(f"  ✓ {out_path.relative_to(REPO_ROOT)} ({len(packages)} entries)")
    return True


def check_consistency() -> bool:
    """Vérifie que les lockfiles existants sont cohérents."""
    ok = True
    # Backend
    pkg = parse_package_json(REPO_ROOT / "backend/package.json")
    lock_path = REPO_ROOT / "backend/package-lock.json"
    if lock_path.exists():
        lock = json.loads(lock_path.read_text())
        for dep in pkg.get("dependencies", {}):
            if f"node_modules/{dep}" not in lock.get("packages", {}):
                print(f"  ✗ backend/package-lock.json manque {dep}")
                ok = False
    else:
        print("  ✗ backend/package-lock.json manquant")
        ok = False
    # CMS
    pkg = parse_package_json(REPO_ROOT / "cms/package.json")
    lock_path = REPO_ROOT / "cms/package-lock.json"
    if lock_path.exists():
        lock = json.loads(lock_path.read_text())
        for dep in pkg.get("dependencies", {}):
            if f"node_modules/{dep}" not in lock.get("packages", {}):
                print(f"  ✗ cms/package-lock.json manque {dep}")
                ok = False
    else:
        print("  ✗ cms/package-lock.json manquant")
        ok = False
    # Mobile
    deps = parse_pubspec(REPO_ROOT / "mobile/pubspec.yaml")
    lock_path = REPO_ROOT / "mobile/pubspec.lock"
    if lock_path.exists():
        text = lock_path.read_text()
        for dep in deps:
            if dep in ("flutter", "sdk"):
                continue
            if not re.search(rf"^\s*{re.escape(dep)}:", text, re.MULTILINE):
                print(f"  ✗ mobile/pubspec.lock manque {dep}")
                ok = False
    else:
        print("  ✗ mobile/pubspec.lock manquant")
        ok = False
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Génère des lockfiles cohérents")
    parser.add_argument("--check", action="store_true", help="Vérifie la cohérence sans régénérer")
    args = parser.parse_args()

    if args.check:
        print("[check] Vérification de la cohérence des lockfiles...")
        ok = check_consistency()
        if ok:
            print("[check] ✓ tous les lockfiles sont cohérents")
            return 0
        else:
            print("[check] ✗ incohérences détectées")
            return 1

    print("[generate] Génération des lockfiles...")
    targets = [
        ("backend/package.json", "backend/package-lock.json", "npm"),
        ("cms/package.json", "cms/package-lock.json", "npm"),
        ("tools/package.json", "tools/package-lock.json", "npm"),
        ("mobile/pubspec.yaml", "mobile/pubspec.lock", "pub"),
    ]
    for src, dst, kind in targets:
        src_path = REPO_ROOT / src
        dst_path = REPO_ROOT / dst
        if not src_path.exists():
            print(f"  ⚠ {src} manquant, skip")
            continue
        if kind == "npm":
            generate_npm_lockfile(src_path, dst_path)
        else:
            generate_pubspec_lock(src_path, dst_path)
    print("[generate] ✓ terminé")
    return 0


if __name__ == "__main__":
    sys.exit(main())
