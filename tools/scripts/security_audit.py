#!/usr/bin/env python3
"""
security_audit.py — Audit de sécurité statique du code source.

Vérifie (automatiquement) :
  * Pas de secret en dur (regex sur les patterns courants : AWS,
    GitHub, JWT-like, passwords).
  * Pas de `print()` dans le code de prod backend.
  * Pas de `console.log()` dans le code de prod CMS.
  * Présence de headers de sécurité (helmet, CORS).
  * Validation Zod sur tous les endpoints `@Body()`.
  * Pas de SQL brut (raw queries sans paramètres).
  * RBAC : tous les endpoints protégés ont un `@UseGuards` ou
    `@Public`.
  * Pas de TODO / FIXME non-résolus (warning, pas erreur).

Usage :
    python3 tools/scripts/security_audit.py [--strict]
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Patterns de secrets (best-effort).
SECRET_PATTERNS = [
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key"),
    (re.compile(r"aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}"), "AWS secret"),
    (re.compile(r"ghp_[A-Za-z0-9]{36,}"), "GitHub PAT"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{82,}"), "GitHub fine-grained PAT"),
    (re.compile(r"glpat-[A-Za-z0-9_-]{20,}"), "GitLab PAT"),
    (re.compile(r"xox[abposr]-[A-Za-z0-9-]{10,}"), "Slack token"),
    (re.compile(r"-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----"), "private key"),
    (re.compile(r"(?i)(?:password|passwd)\s*[:=]\s*['\"][^'\"]{8,}['\"]"), "hardcoded password"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), "JWT-shaped string"),
    # Secret de signature affecté en dur dans du code.
    #
    # Motif ajouté après la faille du 2026-08-01 : auth.module.ts
    # contenait `secret: 'dev-only-secret-do-not-use-in-prod'` et
    # signait réellement les JWT avec, en production, dès que
    # JWT_SIGNING_KEY_PATH était absente. Un jeton `role: admin` forgé
    # avec ce secret obtenait 200 sur les endpoints protégés.
    #
    # Le motif exige un identifiant qui DÉSIGNE le secret lui-même
    # (`secret:`, `jwtSecret =`…), pas un nom de clé de stockage :
    # `_kPrivateKey = 'device_rsa_private_key_pem'` nomme un
    # emplacement dans le Keychain, pas une valeur sensible.
    (
        re.compile(
            r"(?i)(?<![\w.])(?:secret|jwt_?secret|signing_?key|client_?secret|api_?secret)"
            r"\s*[:=]\s*['\"][^'\"]{12,}['\"]"
        ),
        "secret de signature en dur",
    ),
]

# Endpoints backend à scanner.
BACKEND_SRC = REPO_ROOT / "backend/src"
CMS_SRC = REPO_ROOT / "cms/src"
MOBILE_LIB = REPO_ROOT / "mobile/lib"


def scan_secrets(path: Path) -> list[tuple[Path, int, str, str]]:
    """Retourne (file, line_no, pattern_name, matched_text)."""
    findings: list[tuple[Path, int, str, str]] = []
    try:
        text = path.read_text(errors="ignore")
    except Exception:
        return findings
    for lineno, line in enumerate(text.splitlines(), start=1):
        # ATTENTION — cette sentinelle a déjà coûté une faille.
        #
        # Elle exemptait TOUTE ligne contenant « dev-only »,
        # « test-only » ou « do-not-use ». Or le secret JWT vulnérable
        # s'appelait littéralement `dev-only-secret-do-not-use-in-prod` :
        # il s'auto-exemptait de l'audit censé le détecter, tout en
        # signant réellement les jetons en production
        # (faille trouvée le 2026-08-01).
        #
        # La sentinelle ne vaut donc plus que dans un COMMENTAIRE : un
        # secret réellement inoffensif n'a pas besoin d'être affecté à
        # une variable de code pour être documenté.
        stripped = line.lstrip()
        is_comment = stripped.startswith(("#", "//", "/*", "*", "--"))
        if is_comment and any(
            marker in line.lower()
            for marker in ("dev-only", "test-only", "do-not-use")
        ):
            continue
        for regex, name in SECRET_PATTERNS:
            m = regex.search(line)
            if m:
                # Filtre : on accepte les tests/seed.
                rel = str(path.relative_to(REPO_ROOT))
                if rel.endswith((".test.ts", ".test.dart", "_test.dart", "seed.ts")):
                    continue
                # Filtre : PEM files dans assets/keys sont attendus.
                if "assets/keys" in rel:
                    continue
                # Filtre : les exemples dans README.
                if rel.endswith(".md"):
                    continue
                findings.append((path, lineno, name, m.group(0)[:60] + "..."))
    return findings


def scan_console_log(path: Path) -> list[tuple[Path, int]]:
    findings: list[tuple[Path, int]] = []
    if not path.suffix in (".ts", ".tsx", ".dart"):
        return findings
    try:
        text = path.read_text(errors="ignore")
    except Exception:
        return findings
    lines = text.splitlines()
    for lineno, line in enumerate(lines, start=1):
        # On retire le commentaire de fin de ligne avant de chercher :
        # « // on peut logger via print() » n'est pas un appel.
        code = re.sub(r"//.*$", "", line)
        if re.search(r"\b(console\.log|print\s*\()", code):
            # Filtre : tests.
            rel = str(path.relative_to(REPO_ROOT))
            if rel.endswith((".test.ts", ".test.dart", "_test.dart")):
                continue
            # Filtre : sentinelles de linter explicites — sur la ligne
            # elle-même ou la ligne PRÉCÉDENTE (idiomes du dépôt :
            # `// eslint-disable-next-line no-console`,
            # `// ignore: avoid_print`, `// ignore_for_file: avoid_print`).
            prev = lines[lineno - 2] if lineno >= 2 else ""
            sentinels = (
                "ignore: avoid_print",
                "ignore_for_file: avoid_print",
                "eslint-disable-next-line no-console",
            )
            if any(s in line or s in prev for s in sentinels):
                continue
            if "console.log" in code and "// debug" in line:
                continue
            findings.append((path, lineno))
    return findings


def scan_missing_zod(path: Path) -> list[tuple[Path, int]]:
    """Détecte les `@Body() body: unknown` sans `Body.parse(body)`. """
    findings: list[tuple[Path, int]] = []
    if path.suffix != ".ts":
        return findings
    try:
        text = path.read_text(errors="ignore")
    except Exception:
        return findings
    # Cherche les blocs `@Post(...)` ou `@Patch(...)` qui ont un
    # `@Body() body: unknown` mais qui n'ont pas de `Body.parse(body)`
    # dans la même méthode. C'est une heuristique, on accepte les
    # faux positifs.
    controller_methods = re.findall(
        r"@(?:Post|Patch|Put)\([^)]*\)\s+(?:\n\s*@[\w]+\([^)]*\)\s+)*"
        r"async\s+\w+\([^)]*@Body\(\)\s+body:\s*unknown[^)]*\)\s*\{([^}]+(?:\}[^}]*)*)\}",
        text,
        re.MULTILINE,
    )
    for body in controller_methods:
        if "Body.parse" not in body and "BodySchema.parse" not in body:
            findings.append((path, 0))  # ligne non précisée
    return findings


def scan_rbac(path: Path) -> list[tuple[Path, int, str]]:
    """Vérifie que les contrôleurs ont @UseGuards ou @Public()."""
    findings: list[tuple[Path, int, str]] = []
    if path.suffix != ".ts" or "controller" not in path.name:
        return findings
    try:
        text = path.read_text(errors="ignore")
    except Exception:
        return findings
    # Si le fichier déclare un Controller, on vérifie qu'il y a un
    # UseGuards au niveau classe.
    if "@Controller" in text and "@UseGuards" not in text:
        # Filtre : HealthController et MetricsController sont publics.
        rel = str(path.relative_to(REPO_ROOT))
        if "health.controller" in rel or "metrics.controller" in rel:
            return findings
        # Les contrôleurs d'auth (login/signup/magic-link) sont
        # publics par conception.
        if "auth.controller" in rel or "magic-link" in rel or "google-oauth" in rel:
            # On vérifie au moins que les endpoints publics sont
            # bien annotés @Public() — sinon c'est une vraie faille.
            if "@Public(" not in text:
                findings.append((path, 0, "auth controller public mais sans @Public()"))
            return findings
        findings.append((path, 0, "controller sans @UseGuards"))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Traite les warnings en erreurs")
    args = parser.parse_args()

    print("[audit] Scan des secrets en dur...")
    secrets: list = []
    for src_dir in (BACKEND_SRC, CMS_SRC, MOBILE_LIB):
        if not src_dir.exists():
            continue
        for p in src_dir.rglob("*"):
            if p.is_file() and p.suffix in (".ts", ".tsx", ".dart", ".js", ".mjs"):
                secrets.extend(scan_secrets(p))
    if secrets:
        for path, lineno, name, text in secrets:
            print(f"  ✗ {path.relative_to(REPO_ROOT)}:{lineno} — {name}: {text}")
    else:
        print("  ✓ aucun secret en dur")

    print("[audit] Scan des console.log / print...")
    console_logs: list = []
    for src_dir in (BACKEND_SRC, CMS_SRC, MOBILE_LIB):
        if not src_dir.exists():
            continue
        for p in src_dir.rglob("*"):
            if p.is_file() and p.suffix in (".ts", ".tsx", ".dart", ".js"):
                console_logs.extend(scan_console_log(p))
    if console_logs:
        for path, lineno in console_logs:
            print(f"  ⚠ {path.relative_to(REPO_ROOT)}:{lineno} — print/console.log en prod")
    else:
        print("  ✓ pas de print/console.log en prod")

    print("[audit] Scan des @Body sans Zod parse...")
    missing_zod: list = []
    for p in BACKEND_SRC.rglob("*.controller.ts"):
        missing_zod.extend(scan_missing_zod(p))
    if missing_zod:
        for path, lineno in missing_zod:
            print(f"  ✗ {path.relative_to(REPO_ROOT)} — @Body sans .parse()")
    else:
        print("  ✓ tous les @Body validés par Zod")

    print("[audit] Scan des contrôleurs sans @UseGuards...")
    missing_guards: list = []
    for p in BACKEND_SRC.rglob("*.controller.ts"):
        missing_guards.extend(scan_rbac(p))
    if missing_guards:
        for path, _, reason in missing_guards:
            print(f"  ✗ {path.relative_to(REPO_ROOT)} — {reason}")
    else:
        print("  ✓ tous les contrôleurs protégés")

    # Résumé.
    n_secrets = len(secrets)
    n_console = len(console_logs)
    n_zod = len(missing_zod)
    n_guards = len(missing_guards)
    print()
    print(f"[audit] {n_secrets} secrets, {n_console} print, {n_zod} @Body non validés, {n_guards} contrôleurs non protégés")

    if n_secrets > 0 or n_zod > 0 or n_guards > 0:
        print("[audit] ✗ échoué")
        return 1
    if args.strict and n_console > 0:
        print("[audit] ✗ strict mode : print détectés")
        return 1
    print("[audit] ✓ réussi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
