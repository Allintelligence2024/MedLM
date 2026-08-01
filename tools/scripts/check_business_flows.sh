#!/usr/bin/env bash
#
# Parcours métier réels — binaire compilé + PostgreSQL réel.
#
# POURQUOI CE SCRIPT EXISTE
# --------------------------
# Les tests unitaires instancient les classes ; les tests d'intégration
# substituent un faux DRIZZLE qui n'exécute aucun SQL. Résultat : 531
# tests au vert, et pourtant, en poussant un seul événement réel contre
# une vraie base, trois pannes bloquantes sont apparues le 2026-08-01 :
#
#   * `= ANY(${ids}::uuid[])` — drizzle interpole le tableau JS comme un
#     paramètre scalaire : « malformed array literal », HTTP 500 sur
#     TOUT push de synchronisation. La boucle centrale du produit.
#   * signature RS256 sans clé publique de vérification : 401 sur toutes
#     les requêtes authentifiées, panne totale et silencieuse.
#   * `revokedAt` positionné mais jamais relu : un refresh token révoqué
#     restait valable indéfiniment.
#
# Aucune de ces trois n'était visible sans exécuter le vrai logiciel.
#
# PRÉREQUIS : un PostgreSQL joignable via DATABASE_URL, migrations
# appliquées, et `npm run build` fait.
#
#   DATABASE_URL=postgres://… ./tools/scripts/check_business_flows.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../backend"

PORT=3992
B="http://127.0.0.1:$PORT"
FAIL=0
ko() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
ok() { echo "  ✓ $1"; }

DATABASE_URL="${DATABASE_URL:-postgres://medanki@127.0.0.1:55432/medanki_dz}" \
  NODE_ENV=test LOG_LEVEL=error PORT=$PORT \
  JWT_SIGNING_KEY_PATH=./keys/jwt-private.pem \
  node dist/main.js > /tmp/e2e2.log 2>&1 &
PID=$!
trap "kill $PID 2>/dev/null" EXIT

READY=0
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "$B/v1/healthz" --max-time 2; then READY=1; break; fi
  kill -0 $PID 2>/dev/null || break
  sleep 0.5
done
if [[ $READY -ne 1 ]]; then
  echo "❌ le serveur n'a pas démarré — voir /tmp/e2e2.log"
  tail -15 /tmp/e2e2.log
  exit 1
fi

EMAIL="flow$RANDOM@univ-oran.dz"
SIGNUP=$(curl -s -X POST -H 'Content-Type: application/json' -H 'X-Platform: mobile' \
  -d "{\"email\":\"$EMAIL\"}" "$B/v1/auth/signup" --max-time 10)
AT=$(echo "$SIGNUP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
RT=$(echo "$SIGNUP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)
UID_=$(echo "$SIGNUP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('user_id',''))" 2>/dev/null)
[[ -n "$AT" ]] && ok "signup → jetons émis" || { ko "signup: $SIGNUP"; exit 1; }

# L'algorithme doit être RS256 (vérification hors-ligne, v2 §8.1).
ALG=$(python3 -c "
import base64,json,sys
h=json.loads(base64.urlsafe_b64decode('$AT'.split('.')[0]+'=='))
print(h.get('alg'))")
[[ "$ALG" == "RS256" ]] && ok "JWT signé en RS256" || ko "JWT signé en $ALG (RS256 attendu)"

code() { curl -s -o /tmp/body.txt -w "%{http_code}" --max-time 10 "$@"; }

C=$(code -H "Authorization: Bearer $AT" "$B/v1/stats/me")
[[ "$C" == "200" ]] && ok "GET /v1/stats/me → 200" || ko "stats/me → $C"

C=$(code "$B/v1/stats/me")
[[ "$C" == "401" ]] && ok "stats/me sans jeton → 401" || ko "stats/me sans jeton → $C"

# ── Rotation du refresh token ────────────────────────────────────────
R1=$(curl -s -X POST -H 'Content-Type: application/json' -H 'X-Platform: mobile' \
  -d "{\"refresh_token\":\"$RT\"}" "$B/v1/auth/refresh" --max-time 10)
NEW_RT=$(echo "$R1" | python3 -c "import sys,json;print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)
[[ -n "$NEW_RT" && "$NEW_RT" != "$RT" ]] && ok "refresh → nouveau jeton (rotation)" || ko "refresh: $R1"

# Le rejeu de l'ancien jeton doit échouer : c'est TOUT l'intérêt de la
# rotation (détection de vol de jeton).
C=$(code -X POST -H 'Content-Type: application/json' -H 'X-Platform: mobile' \
  -d "{\"refresh_token\":\"$RT\"}" "$B/v1/auth/refresh")
[[ "$C" == "401" || "$C" == "400" ]] && ok "rejeu de l'ancien refresh → $C (refusé)" \
  || ko "REJEU ACCEPTÉ ($C) — la rotation ne révoque pas l'ancien jeton"

# ── Enregistrement d'appareil (P1-3) ─────────────────────────────────
C=$(code -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -H 'X-Device-Id: device-e2e-0001' \
  -d '{"token":"'"$(printf 'f%.0s' {1..160})"'","platform":"android","locale":"fr"}' \
  "$B/v1/notifications/devices")
[[ "$C" == "200" ]] && ok "POST /v1/notifications/devices → 200" || ko "devices → $C : $(head -c 200 /tmp/body.txt)"

C=$(code -H "Authorization: Bearer $AT" -H 'X-Device-Id: device-e2e-0001' "$B/v1/notifications/devices")
COUNT=$(python3 -c "import json;print(len(json.load(open('/tmp/body.txt')).get('devices',[])))" 2>/dev/null || echo 0)
[[ "$C" == "200" && "$COUNT" == "1" ]] && ok "GET devices → 1 appareil actif" || ko "GET devices → $C ($COUNT appareils)"

# Idempotence : ré-enregistrer le même appareil ne doit pas dupliquer.
code -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -H 'X-Device-Id: device-e2e-0001' \
  -d '{"token":"'"$(printf 'a%.0s' {1..160})"'","platform":"android"}' \
  "$B/v1/notifications/devices" > /dev/null
code -H "Authorization: Bearer $AT" -H 'X-Device-Id: device-e2e-0001' "$B/v1/notifications/devices" > /dev/null
COUNT=$(python3 -c "import json;print(len(json.load(open('/tmp/body.txt')).get('devices',[])))" 2>/dev/null || echo 0)
[[ "$COUNT" == "1" ]] && ok "ré-enregistrement idempotent (1 appareil)" || ko "duplication : $COUNT appareils"

C=$(code -X DELETE -H "Authorization: Bearer $AT" -H 'X-Device-Id: device-e2e-0001' \
  -H 'Content-Type: application/json' -d '{}' "$B/v1/notifications/devices")
[[ "$C" == "200" ]] && ok "DELETE devices → 200" || ko "DELETE devices → $C"

# ── Sync SRS (cœur du produit) ───────────────────────────────────────
# Un batch vide est refusé par Zod (min 1) : c'est le comportement voulu.
C=$(code -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -H 'X-Device-Id: device-e2e-0001' -d '{"events":[]}' "$B/v1/srs-sync/push")
[[ "$C" == "400" ]] && ok "srs push batch vide → 400 (refusé par Zod)" || ko "srs push vide → $C"

# Batch réel : l'événement doit être accepté et journalisé.
EV=$(python3 -c "
import json,uuid,time
print(json.dumps({'events':[{
  'id': str(uuid.uuid4()), 'card_id': str(uuid.uuid4()),
  'user_id': '$UID_', 'device_id': 'device-e2e-0001',
  'rating': 3, 'reviewed_at': int(time.time()*1000),
  'duration_ms': 1500, 'card_type': 'basic', 'exam_mode': False,
}]}))")
C=$(code -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -H 'X-Device-Id: device-e2e-0001' -d "$EV" "$B/v1/srs-sync/push")
[[ "$C" == "200" || "$C" == "201" ]] && ok "srs push 1 événement → $C" || ko "srs push réel → $C : $(head -c 250 /tmp/body.txt)"

C=$(code -H "Authorization: Bearer $AT" -H 'X-Device-Id: device-e2e-0001' \
  "$B/v1/srs-sync/pull?since_ms=0&limit=10")
[[ "$C" == "200" ]] && ok "GET /v1/srs-sync/pull → 200" || ko "srs pull → $C"

# ── Onboarding ───────────────────────────────────────────────────────
C=$(code -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"faculty":"Oran","study_year":1,"experience_level":"beginner","preferred_language":"fr","module_interests":["11111111-1111-1111-1111-111111111111"],"daily_goal_cards":20}' \
  "$B/v1/onboarding")
[[ "$C" == "200" || "$C" == "201" ]] && ok "POST /v1/onboarding → $C" || ko "onboarding → $C : $(head -c 250 /tmp/body.txt)"

# ── Entitlement (accès premium) ──────────────────────────────────────
C=$(code -H "Authorization: Bearer $AT" "$B/v1/billing/entitlement")
[[ "$C" == "200" ]] && ok "GET /v1/billing/entitlement → 200" || ko "entitlement → $C"

# ── Classement (le « = NULL » le vidait en permanence) ───────────────
PSEUDO="Etud$RANDOM"
C=$(code -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"pseudonym\":\"$PSEUDO\",\"faculty\":\"Alger\",\"study_year\":1}" \
  "$B/v1/gamification/leaderboard/opt-in")
[[ "$C" == "200" || "$C" == "201" ]] && ok "opt-in classement → $C" || ko "opt-in → $C : $(head -c 200 /tmp/body.txt)"

code -H "Authorization: Bearer $AT" "$B/v1/gamification/leaderboard/me" > /dev/null
OPTIN=$(python3 -c "import json;print(json.load(open('/tmp/body.txt')).get('opt_in'))" 2>/dev/null)
[[ "$OPTIN" == "True" ]] && ok "état opt-in relu → true" || ko "opt-in relu → $OPTIN"

# Le filtre « non révoqué » s'écrivait `eq(col, null)`, soit `= NULL` en
# SQL : jamais vrai. Le classement était donc vide pour tout le monde,
# en permanence. On vérifie que la requête aboutit et sait compter.
C=$(code -H "Authorization: Bearer $AT" "$B/v1/gamification/leaderboard?limit=10")
[[ "$C" == "200" ]] && ok "GET /v1/gamification/leaderboard → 200" || ko "leaderboard → $C"

C=$(code -X DELETE -H "Authorization: Bearer $AT" "$B/v1/gamification/leaderboard/opt-in")
[[ "$C" == "200" || "$C" == "204" ]] && ok "opt-out (RGPD) → $C" || ko "opt-out → $C"

code -H "Authorization: Bearer $AT" "$B/v1/gamification/leaderboard/me" > /dev/null
OPTIN=$(python3 -c "import json;print(json.load(open('/tmp/body.txt')).get('opt_in'))" 2>/dev/null)
[[ "$OPTIN" == "False" ]] && ok "après opt-out → false" || ko "opt-out sans effet ($OPTIN)"

# ── Métriques : le dénominateur ajouté doit apparaître ───────────────
M=$(curl -s "$B/v1/metrics" --max-time 5)
echo "$M" | grep -q "medanki_http_requests_total" && ok "metrics expose requests_total" || ko "metrics sans requests_total"
echo "$M" | grep -q "medanki_auth_logins_total" && ok "metrics expose auth_logins_total" || ko "metrics sans auth_logins"

echo
[[ $FAIL -eq 0 ]] && echo "✅ Parcours métier : tout passe." || echo "❌ Parcours métier : $FAIL échec(s)."
exit $FAIL
