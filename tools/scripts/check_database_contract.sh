#!/usr/bin/env bash
#
# Contrat PostgreSQL MVP — vérifications réelles.
#
# PRÉREQUIS :
#   DATABASE_URL      URL PostgreSQL (avec droits DDL/DML)
#   PG_SCHEMA         Schéma cible (défaut: public)
#
set -uo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL manquante"
  exit 1
fi

SCHEMA="${PG_SCHEMA:-public}"

psql_opts=(
  "$DATABASE_URL"
  "-v" "ON_ERROR_STOP=1"
  "-v" "sschema=$SCHEMA"
  "--no-align"
  "--tuples-only"
  "-c" "SET search_path TO \"$SCHEMA\""
)

FAIL=0
ko() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
ok() { echo "  ✓ $1"; }

# ── Helpers ────────────────────────────────────────────────────────────────
count() {
  psql "${psql_opts[@]}" -c "$1" 2>/dev/null | tr -d '[:space:]'
}

# ── 1. 37 tables ────────────────────────────────────────────────────────────
TABLES_COUNT=$(count "SELECT count(*) FROM information_schema.tables WHERE table_schema = current_setting('sschema') AND table_type = 'BASE TABLE'")
if [[ "$TABLES_COUNT" -eq 37 ]]; then
  ok "37 tables présentes ($TABLES_COUNT)"
else
  ko "37 tables attendues, $TABLES_COUNT trouvées"
fi

# ── 2. Utilisateurs seedés ──────────────────────────────────────────────────
for email in admin@medlm.dz author@medlm.dz student@medlm.dz; do
  if psql "${psql_opts[@]}" -c "SELECT 1 FROM users WHERE email = '$email'" 2>/dev/null | grep -q 1; then
    ok "utilisateur seedé : $email"
  else
    ko "utilisateur manquant : $email"
  fi
done

# ── 3. Rôles ───────────────────────────────────────────────────────────────
for role in admin author student; do
  if psql "${psql_opts[@]}" -c "SELECT 1 FROM users WHERE rbac_role = '$role'" 2>/dev/null | grep -q 1; then
    ok "rôle présent : $role"
  else
    ko "rôle manquant : $role"
  fi
done

# ── 4. Decks gratuit et premium ────────────────────────────────────────────
if psql "${psql_opts[@]}" -c "SELECT 1 FROM decks WHERE is_premium = false AND published_at IS NOT NULL" 2>/dev/null | grep -q 1; then
  ok "deck gratuit publié"
else
  ko "deck gratuit publié manquant"
fi

if psql "${psql_opts[@]}" -c "SELECT 1 FROM decks WHERE is_premium = true AND published_at IS NOT NULL" 2>/dev/null | grep -q 1; then
  ok "deck premium publié"
else
  ko "deck premium publié manquant"
fi

# ── 5. Cartes publiées ─────────────────────────────────────────────────────
CARD_COUNT=$(count "SELECT count(*) FROM cards WHERE status = 'published'")
if [[ "$CARD_COUNT" -ge 1 ]]; then
  ok "cartes publiées : $CARD_COUNT"
else
  ko "cartes publiées manquantes"
fi

# ── 6. Entitlement premium actif ───────────────────────────────────────────
if psql "${psql_opts[@]}" -c "
  SELECT 1 FROM entitlements
  WHERE plan = 'premium'
    AND (expires_at IS NULL OR expires_at > now())
" 2>/dev/null | grep -q 1; then
  ok "entitlement premium actif"
else
  ko "entitlement premium actif manquant"
fi

# ── 7. Clés étrangères dans pg_constraint ───────────────────────────────────
FK_COUNT=$(count "SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_setting('sschema'))")
if [[ "$FK_COUNT" -ge 20 ]]; then
  ok "clés étrangères présentes : $FK_COUNT"
else
  ko "clés étrangères insuffisantes : $FK_COUNT (< 20 attendu)"
fi

# ── 8. Contraintes CHECK dans pg_constraint ────────────────────────────────
CK_COUNT=$(count "SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_setting('sschema'))")
if [[ "$CK_COUNT" -ge 10 ]]; then
  ok "contraintes CHECK présentes : $CK_COUNT"
else
  ko "contraintes CHECK insuffisantes : $CK_COUNT (< 10 attendu)"
fi

# ── 9. Rejet d'un rating invalide ─────────────────────────────────────────
if psql "${psql_opts[@]}" -c "
  INSERT INTO review_logs (id, user_id, card_id, device_id, rating, duration_ms, card_type, exam_mode, reviewed_at, received_at)
  VALUES ('ff000000-0000-4000-8000-000000000099', (SELECT id FROM users LIMIT 1), (SELECT id FROM cards LIMIT 1), 'dev', 5, 0, 'basic', false, 1, now())
" 2>/dev/null | grep -q 'ERROR'; then
  ok "rating invalide (5) rejeté"
else
  ko "rating invalide (5) accepté — CHECK manquant"
fi

# ── 10. Rejet d'un deck orphelin (FK) ──────────────────────────────────────
if psql "${psql_opts[@]}" -c "
  INSERT INTO cards (id, deck_id, type, status, version, content, source_meta, tags, is_premium, created_at, updated_at)
  VALUES ('ff000000-0000-4000-8000-000000000099', 'ff000000-0000-4000-8000-000000000099', 'basic', 'published', 1, '{}', '{}', '{}', false, now(), now())
" 2>/dev/null | grep -q 'ERROR'; then
  ok "deck orphelin rejeté (FK)"
else
  ko "deck orphelin accepté — FK manquante"
fi

# ── 11. Append-only review_logs ────────────────────────────────────────────
RLID=$(psql "${psql_opts[@]}" -c "SELECT id FROM review_logs LIMIT 1" 2>/dev/null | head -n 3 | tail -n 1 | tr -d '[:space:]')
if [[ -n "$RLID" ]]; then
  if psql "${psql_opts[@]}" -c "UPDATE review_logs SET duration_ms = 1 WHERE id = '$RLID'" 2>/dev/null | grep -q 'ERROR'; then
    ok "review_logs append-only (UPDATE refusé)"
  else
    ko "review_logs autorise UPDATE — trigger manquant"
  fi
else
  ko "aucun review_log pour tester l'append-only"
fi

echo
if [[ $FAIL -eq 0 ]]; then
  echo "✅ Contrat PostgreSQL MVP : tout passe."
  exit 0
else
  echo "❌ Contrat PostgreSQL MVP : $FAIL échec(s)."
  exit 1
fi
