#!/usr/bin/env python3
"""Applique la configuration de release Android (audit P2-8).

`mobile/android/` n'est pas versionné : c'est un artefact régénéré par
`flutter create` (cf. mobile/README.md). Or `flutter create` produit un
`build.gradle.kts` de démonstration qui :

  * signe le build de release avec la clé de DEBUG — un APK ainsi signé
    est refusé par le Play Store, et s'il passait, il serait
    ininstallable en mise à jour ;
  * n'active ni R8 (`minifyEnabled`), ni le retrait des ressources
    inutilisées — l'APK embarque tout, non obfusqué ;
  * fixe `applicationId` à `com.example.<nom>`.

Ce script réécrit ces quatre points sur le fichier généré. Il est
idempotent : le relancer sur un fichier déjà corrigé ne change rien.

Usage (après `flutter create`, en local comme en CI) :
    python3 tools/scripts/apply_android_release_config.py
    python3 tools/scripts/apply_android_release_config.py --check

Signature : les secrets viennent de l'environnement, jamais du dépôt.
    ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
    ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
Absents → le build de release reste NON signé (échec explicite au
moment de la signature, plutôt qu'un APK signé en debug qui se
découvre au dépôt sur la console).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRADLE = ROOT / "mobile" / "android" / "app" / "build.gradle.kts"
APPLICATION_ID = "dz.medanki.app"

SIGNING_BLOCK = """
    // ── Signature de release (audit P2-8) ─────────────────────────────
    // Les secrets viennent de l'environnement (secrets CI), jamais du
    // dépôt. Sans eux, le build release n'est pas signé : c'est
    // volontaire — un échec explicite vaut mieux qu'un APK signé avec
    // la clé de debug, que le Play Store refuse.
    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (keystorePath != null && file(keystorePath).exists()) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
"""

RELEASE_BUILD_TYPE = """
        release {
            // R8 : obfuscation + retrait du code mort. Les règles de
            // conservation (Flutter, FCM, WorkManager, crypto…) vivent
            // dans mobile/proguard-rules.pro — sans elles, l'app
            // compile puis échoue à l'exécution.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                file("../../proguard-rules.pro"),
            )
            signingConfig = signingConfigs.getByName("release")
        }
"""


def patch(text: str) -> tuple[str, list[str]]:
    changes: list[str] = []

    # 1. applicationId ET namespace — `flutter create` met com.example
    # dans les deux, et n'en corriger qu'un laisse un build incohérent.
    if re.search(r'applicationId\s*=\s*"com\.example', text):
        text = re.sub(
            r'applicationId\s*=\s*"com\.example[^"]*"',
            f'applicationId = "{APPLICATION_ID}"',
            text,
        )
        changes.append(f"applicationId → {APPLICATION_ID}")
    if re.search(r'namespace\s*=\s*"com\.example', text):
        text = re.sub(
            r'namespace\s*=\s*"com\.example[^"]*"',
            f'namespace = "{APPLICATION_ID}"',
            text,
        )
        changes.append(f"namespace → {APPLICATION_ID}")

    # 2. signingConfigs
    if "signingConfigs {" not in text:
        text = re.sub(
            r"(\n\s*buildTypes\s*\{)",
            SIGNING_BLOCK + r"\1",
            text,
            count=1,
        )
        changes.append("signingConfigs release ajouté")

    # 3. buildTypes.release — remplace le bloc de démonstration.
    demo_release = re.search(
        r"\n\s*release\s*\{[^}]*signingConfig\s*=\s*signingConfigs\.getByName\(\"debug\"\)[^}]*\}",
        text,
    )
    if demo_release:
        text = text.replace(demo_release.group(0), RELEASE_BUILD_TYPE)
        changes.append("buildTypes.release : R8 + shrink + signature de release")
    elif "isMinifyEnabled = true" not in text:
        text = re.sub(
            r"(\n\s*buildTypes\s*\{)",
            r"\1" + RELEASE_BUILD_TYPE,
            text,
            count=1,
        )
        changes.append("buildTypes.release ajouté (R8 + shrink)")

    return text, changes


def verify(text: str) -> list[str]:
    problems: list[str] = []
    if re.search(r'(applicationId|namespace)\s*=\s*"com\.example', text):
        problems.append("applicationId/namespace encore en com.example")
    if 'signingConfigs.getByName("debug")' in text:
        problems.append("le build release est signé avec la clé de DEBUG")
    if "isMinifyEnabled = true" not in text:
        problems.append("R8 désactivé (isMinifyEnabled absent)")
    if "isShrinkResources = true" not in text:
        problems.append("retrait des ressources inutilisées désactivé")
    if "proguard-rules.pro" not in text:
        problems.append("proguard-rules.pro non référencé")
    rules = (ROOT / "mobile" / "proguard-rules.pro").read_text(encoding="utf-8")
    active = [
        line.strip()
        for line in rules.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if any(line.startswith("-dontobfuscate") for line in active):
        problems.append("proguard-rules.pro désactive l'obfuscation")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="vérifie sans modifier (retourne 1 si la config est incorrecte)",
    )
    args = parser.parse_args()

    if not GRADLE.exists():
        message = (
            f"{GRADLE.relative_to(ROOT)} absent — lancer d'abord "
            "`cd mobile && flutter create --platforms=android,ios .`"
        )
        if args.check:
            # Hors CI mobile (sandbox, backend-only), l'absence du
            # dossier de plateforme est normale : on n'échoue pas.
            print(f"⏭  {message}")
            return 0
        print(f"❌ {message}")
        return 1

    text = GRADLE.read_text(encoding="utf-8")

    if args.check:
        problems = verify(text)
        for p in problems:
            print(f"  ❌ {p}")
        if problems:
            print(
                "\n❌ Configuration de release Android incorrecte — lancer "
                "tools/scripts/apply_android_release_config.py"
            )
            return 1
        print("✅ Release Android : R8, shrink, signature et applicationId conformes.")
        return 0

    patched, changes = patch(text)
    if changes:
        GRADLE.write_text(patched, encoding="utf-8")
        for c in changes:
            print(f"  ✓ {c}")
    else:
        print("  = déjà conforme")

    problems = verify(patched)
    for p in problems:
        print(f"  ❌ {p}")
    if problems:
        return 1
    print("✅ Configuration de release Android appliquée.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
