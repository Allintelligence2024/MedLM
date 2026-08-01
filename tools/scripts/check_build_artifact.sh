#!/usr/bin/env bash
#
# Le binaire compilé démarre-t-il vraiment ? (audit — bug trouvé le 2026-08-01)
#
# LE BUG QUE CE SCRIPT VERROUILLE
# --------------------------------
# `tsconfig.json` inclut `test/**/*` (pour que `tsc --noEmit` typecheck
# les tests). TypeScript calcule alors la racine de sortie comme le plus
# petit ancêtre commun de `src/` et `test/` — c'est-à-dire la racine du
# projet. L'émission partait donc dans `dist/src/main.js`.
#
# `nest build` retournait 0. `tsc --noEmit` passait. Les 514 tests
# passaient. Et pourtant :
#
#   npm start            → Cannot find module '/app/dist/main.js'
#   npm run start:prod   → idem
#   docker run …         → le conteneur meurt au démarrage
#
# Aucune garde ne l'attrapait : les tests instancient les classes
# directement, et le `docker build` de la CI construit l'image sans
# jamais la DÉMARRER. Le premier à découvrir le problème aurait été
# Kubernetes, en CrashLoopBackOff.
#
# Ce script ferme ce trou : il compile, vérifie l'emplacement de sortie,
# démarre réellement le binaire et interroge trois routes.
#
# Usage : ./tools/scripts/check_build_artifact.sh

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
cd backend

PORT="${SMOKE_PORT:-3998}"
FAILURES=0

fail() {
  echo "  ❌ $1"
  FAILURES=$((FAILURES + 1))
}

echo "▸ 1/4 Compilation"
if ! npm run build > /tmp/build_artifact.log 2>&1; then
  fail "npm run build a échoué (voir /tmp/build_artifact.log)"
  tail -20 /tmp/build_artifact.log
  exit 1
fi

echo "▸ 2/4 Emplacement du point d'entrée"
# C'est le cœur du bug : le chemin déclaré par package.json et par le
# Dockerfile doit exister pour de vrai.
ENTRY="$(node -e "process.stdout.write(require('./package.json').scripts.start.split(' ').pop())")"
if [[ ! -f "$ENTRY" ]]; then
  fail "« $ENTRY » (script npm start) n'existe pas après le build"
  echo "     dist/ contient : $(ls dist 2>/dev/null | head -5 | tr '\n' ' ')"
  if [[ -f dist/src/main.js ]]; then
    echo "     → trouvé dist/src/main.js : la racine de sortie a glissé,"
    echo "       vérifier rootDir/include dans tsconfig.build.json"
  fi
  exit 1
fi

# Le Dockerfile doit démarrer le même fichier.
DOCKER_CMD="$(grep -oP 'CMD \["node", "\K[^"]+' Dockerfile 2>/dev/null || true)"
if [[ -n "$DOCKER_CMD" && "$DOCKER_CMD" != "$ENTRY" ]]; then
  fail "Dockerfile démarre « $DOCKER_CMD » mais npm start lance « $ENTRY »"
fi

echo "▸ 3/4 Démarrage réel du binaire"
DATABASE_URL="${DATABASE_URL:-postgres://unused:unused@127.0.0.1:1/unused}" \
  NODE_ENV=test LOG_LEVEL=error PORT="$PORT" \
  node "$ENTRY" > /tmp/smoke_boot.log 2>&1 &
PID=$!
# shellcheck disable=SC2064
trap "kill $PID 2>/dev/null || true" EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/v1/healthz" --max-time 2; then
    READY=1
    break
  fi
  kill -0 $PID 2>/dev/null || break
  sleep 0.5
done

if [[ $READY -ne 1 ]]; then
  fail "le binaire n'a pas répondu sur /v1/healthz"
  tail -20 /tmp/smoke_boot.log
  exit 1
fi

echo "▸ 4/4 Routage (verrouille aussi P0-1)"
code() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$@"
}

HZ=$(code "http://127.0.0.1:$PORT/v1/healthz")
[[ "$HZ" == "200" ]] || fail "/v1/healthz → $HZ (attendu 200)"

# Le gateway est EXCLU du préfixe global : il répond sur /v2/graphql
# (401 sans jeton), pas sur /v1/v2/graphql.
GQL=$(code -X POST -H 'Content-Type: application/json' \
  -d '{"query":"query ViewerStats { viewerStats { period } }"}' \
  "http://127.0.0.1:$PORT/v2/graphql")
[[ "$GQL" != "404" ]] || fail "/v2/graphql → 404 (régression du fix P0-1)"

DOUBLE=$(code -X POST -H 'Content-Type: application/json' -d '{}' \
  "http://127.0.0.1:$PORT/v1/v2/graphql")
[[ "$DOUBLE" == "404" ]] || fail "/v1/v2/graphql → $DOUBLE (attendu 404)"

# Une route v1 quelconque doit rester préfixée.
UNPREFIXED=$(code "http://127.0.0.1:$PORT/healthz")
[[ "$UNPREFIXED" == "404" ]] || fail "/healthz → $UNPREFIXED (le préfixe v1 ne s'applique plus)"

echo
if [[ $FAILURES -gt 0 ]]; then
  echo "❌ Artefact de build : $FAILURES problème(s)."
  exit 1
fi
echo "✅ Artefact de build valide ($ENTRY démarre, /v1/healthz 200, /v2/graphql routé, préfixe v1 intact)."
