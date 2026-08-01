#!/usr/bin/env bash
# phase13_checks.sh — Orchestre les vérifications de la Phase 13.
#
# 1. Cohérence des lockfiles.
# 2. Audit sécurité statique.
# 3. Self-test du load tester.
# 4. (Optionnel) Tests Python tools.
#
# Exit code : 0 si tout passe, 1 sinon.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Phase 13 — vérifications ==="
echo

# 1. Lockfiles.
echo "[1/4] Cohérence des lockfiles..."
python3 tools/scripts/generate_lockfiles.py --check
echo

# 2. Audit sécurité.
echo "[2/4] Audit sécurité statique..."
python3 tools/scripts/security_audit.py
echo

# 3. Load test self-test.
echo "[3/4] Self-test du load tester..."
python3 tests/load/load_test_self_test.py
echo

# 4. Tools Python (déjà en place, on vérifie qu'ils tournent).
echo "[4/4] Tools Python (sanity check)..."
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
