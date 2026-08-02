#!/usr/bin/env bash
# Vérifie la séquence réellement utilisée au déploiement : migration, build,
# démarrage du binaire de production et sonde HTTP. À exécuter contre une base
# jetable : le script applique les migrations mais ne détruit jamais de données.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
DATABASE_URL="${DATABASE_URL:-postgres://medanki@127.0.0.1:55432/medanki_dz}"
PORT="${DEPLOY_CHECK_PORT:-3993}"
LOG="${TMPDIR:-/tmp}/medanki-deploy-sequence.log"

[[ -f "$BACKEND/package.json" ]] || { echo "❌ backend absent"; exit 1; }
[[ -f "$BACKEND/keys/jwt-private.pem" ]] || { echo "❌ clé privée absente : backend/keys/jwt-private.pem"; exit 1; }
[[ -f "$BACKEND/keys/jwt-public.pem" ]] || { echo "❌ clé publique absente : backend/keys/jwt-public.pem"; exit 1; }

cd "$BACKEND"
echo "▸ Migrations sur PostgreSQL réel"
DATABASE_URL="$DATABASE_URL" npm run db:migrate
echo "▸ Build de production"
npm run build
[[ -f dist/main.js ]] || { echo "❌ dist/main.js absent après build"; exit 1; }

echo "▸ Démarrage NODE_ENV=production"
DATABASE_URL="$DATABASE_URL" NODE_ENV=production PORT="$PORT" LOG_LEVEL=error \
  JWT_SIGNING_KEY_PATH=./keys/jwt-private.pem JWT_PUBLIC_KEY_PATH=./keys/jwt-public.pem \
  node dist/main.js >"$LOG" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  if curl --fail --silent --show-error "http://127.0.0.1:$PORT/v1/healthz" >/dev/null; then
    echo "✓ Sonde /v1/healthz répond depuis le binaire de production"
    echo "▸ Parcours métier"
    DATABASE_URL="$DATABASE_URL" "$ROOT/tools/scripts/check_business_flows.sh"
    echo "✅ Séquence de déploiement validée"
    exit 0
  fi
  kill -0 "$pid" 2>/dev/null || { tail -50 "$LOG"; exit 1; }
  sleep .5
done
echo "❌ Le binaire de production n'a pas répondu ; journal : $LOG"
tail -50 "$LOG"
exit 1
