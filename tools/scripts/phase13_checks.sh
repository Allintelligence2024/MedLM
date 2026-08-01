#!/usr/bin/env bash
# phase13_checks.sh — Orchestre les vérifications de la Phase 13.
#
# 1. Cohérence des lockfiles.
# 2. Audit sécurité statique.
# 3. Garde-fou syntaxique (délimiters Dart/Python, marqueurs de conflit).
# 4. Self-test du load tester.
# 5. (Optionnel) Tests Python tools + gardes des phases 19/20 (bloquants).
#
# Exit code : 0 si tout passe, 1 sinon.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Phase 13 — vérifications ==="
echo

# 1. Lockfiles.
echo "[1/5] Cohérence des lockfiles..."
python3 tools/scripts/generate_lockfiles.py --check
echo

# 2. Audit sécurité.
echo "[2/5] Audit sécurité statique..."
python3 tools/scripts/security_audit.py
echo

# 3. Garde-fou syntaxique (délimiters Dart/Python, marqueurs de conflit).
echo "[3/5] Garde-fou syntaxique statique..."
python3 tools/scripts/check_syntax_guard.py
echo

# 4. Load test self-test.
echo "[4/5] Self-test du load tester..."
python3 tests/load/load_test_self_test.py
echo

# 5. Tools Python (déjà en place, on vérifie qu'ils tournent).
echo "[5/5] Tools Python (sanity check)..."
if [ -f tools/check_schema_parity.py ]; then
  python3 tools/check_schema_parity.py > /tmp/phase13_schema.log 2>&1 && \
    echo "  ✓ check_schema_parity.py" || \
    echo "  ⚠ check_schema_parity.py (voir /tmp/phase13_schema.log)"
fi
if [ -f tools/scripts/check_landing.py ]; then
  python3 tools/scripts/check_landing.py && \
    echo "  ✓ check_landing.py (landing Phase 19.7)" || \
    { echo "  ❌ check_landing.py"; exit 1; }
fi
if [ -f tools/scripts/check_store.py ]; then
  python3 tools/scripts/check_store.py && \
    echo "  ✓ check_store.py (stores Phase 19.8)" || \
    { echo "  ❌ check_store.py"; exit 1; }
fi
if [ -f tools/scripts/pentest_prep.py ]; then
  python3 tools/scripts/pentest_prep.py && \
    echo "  ✓ pentest_prep.py (périmètre pen test Phase 19.8)" || \
    { echo "  ❌ pentest_prep.py"; exit 1; }
fi
if [ -f tools/scripts/check_graphql.py ]; then
  python3 tools/scripts/check_graphql.py && \
    echo "  ✓ check_graphql.py (gateway Phase 20.2)" || \
    { echo "  ❌ check_graphql.py"; exit 1; }
fi
if [ -f tools/scripts/check_regions.py ]; then
  python3 tools/scripts/check_regions.py && \
    echo "  ✓ check_regions.py (multi-régions Phase 20.1)" || \
    { echo "  ❌ check_regions.py"; exit 1; }
fi
if [ -f tools/ml_eval.py ]; then
  python3 tools/ml_eval.py && \
    echo "  ✓ ml_eval.py (prédicteur Phase 20.3)" || \
    { echo "  ❌ ml_eval.py"; exit 1; }
fi
if [ -f tools/scripts/check_partnerships.py ]; then
  python3 tools/scripts/check_partnerships.py && \
    echo "  ✓ check_partnerships.py (Phase 20.4)" || \
    { echo "  ❌ check_partnerships.py"; exit 1; }
fi
# Gardes mobiles (audit 2026-08-01) : i18n trilingue, parité des
# facultés avec l'allow-list serveur, Dart statiquement valide.
if [ -f tools/scripts/check_mobile_i18n.py ]; then
  python3 tools/scripts/check_mobile_i18n.py && \
    echo "  ✓ check_mobile_i18n.py (i18n mobile P1-4)" || \
    { echo "  ❌ check_mobile_i18n.py"; exit 1; }
fi
if [ -f tools/scripts/check_faculties_parity.py ]; then
  python3 tools/scripts/check_faculties_parity.py && \
    echo "  ✓ check_faculties_parity.py (allow-list facultés)" || \
    { echo "  ❌ check_faculties_parity.py"; exit 1; }
fi
if [ -f tools/scripts/check_dart_static.py ]; then
  python3 tools/scripts/check_dart_static.py && \
    echo "  ✓ check_dart_static.py (Dart statique P0-2)" || \
    { echo "  ❌ check_dart_static.py"; exit 1; }
fi
if [ -f tools/scripts/check_bundle_assets.py ]; then
  python3 tools/scripts/check_bundle_assets.py && \
    echo "  ✓ check_bundle_assets.py (bundle sans contenu démo P2-4)" || \
    { echo "  ❌ check_bundle_assets.py"; exit 1; }
fi
if [ -f tools/scripts/gen_l10n.py ]; then
  python3 tools/scripts/gen_l10n.py --check && \
    echo "  ✓ gen_l10n.py --check (localisations à jour)" || \
    { echo "  ❌ gen_l10n.py --check"; exit 1; }
fi
if [ -f tools/test_repository_logic.py ]; then
  python3 tools/test_repository_logic.py > /tmp/phase13_repo.log 2>&1 && \
    echo "  ✓ test_repository_logic.py" || \
    echo "  ⚠ test_repository_logic.py (voir /tmp/phase13_repo.log)"
fi
if [ -f tools/validate_content.py ]; then
  python3 tools/validate_content.py > /tmp/phase13_content.log 2>&1 && \
    echo "  ✓ validate_content.py" || \
    echo "  ⚠ validate_content.py (voir /tmp/phase13_content.log)"
fi
echo

echo "=== Phase 13 : OK ==="
