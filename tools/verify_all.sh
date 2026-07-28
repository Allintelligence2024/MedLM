#!/usr/bin/env bash
#
# Vérification complète du moteur SRS (Phase 1).
#
# Trois niveaux de garantie :
#   1. Primitives      — chaque formule FSRS-5 comparée à `ts-fsrs`
#   2. Séquences       — parcours de révision complets comparés à `ts-fsrs`
#   3. Parité Dart     — le Dart et la référence Python restent alignés
#   4. Tests Dart      — golden + propriétés (nécessite le SDK Dart)
#
# Usage : ./tools/verify_all.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
TS_DIR="${TS_FSRS_DIR:-/tmp/tsf}"

echo "════ Phase 1 — Vérification du moteur FSRS-5 ════"
echo

if [ -d "$TS_DIR/node_modules/ts-fsrs" ]; then
  echo "▸ Génération des références depuis ts-fsrs (bibliothèque officielle)"
  (cd "$TS_DIR" && NODE_PATH="$TS_DIR/node_modules" \
      node "$ROOT/tools/verify_against_ts_fsrs.js" > /tmp/tsref.json)
  (cd "$TS_DIR" && NODE_PATH="$TS_DIR/node_modules" \
      node "$ROOT/tools/verify_sequences_ts.js" > /tmp/tsseq.json)

  echo "▸ 1/4 Primitives du modèle"
  python3 tools/cross_check.py /tmp/tsref.json

  echo "▸ 2/4 Séquences de révision complètes"
  python3 tools/cross_check_sequences.py /tmp/tsseq.json
else
  echo "⚠  ts-fsrs absent de $TS_DIR — étapes 1 et 2 ignorées."
  echo "   Pour les activer : mkdir -p $TS_DIR && cd $TS_DIR && npm install ts-fsrs"
fi

echo "▸ 3/4 Parité Dart / référence"
python3 tools/dart_parity_check.py

echo "▸ 4/4 Régénération des scénarios golden"
python3 tools/generate_golden.py

if command -v dart >/dev/null 2>&1; then
  echo "▸ Tests Dart"
  (cd mobile && dart pub get >/dev/null && dart test)
else
  echo "⚠  SDK Dart absent : 'cd mobile && dart test' à lancer en CI (Phase 12)."
fi

echo
echo "════ Vérification terminée ════"
