#!/usr/bin/env bash
# backup_postgres.sh — backup local d'une base PostgreSQL vers R2.
#
# Usage :
#   DATABASE_URL=postgres://... R2_BUCKET=medanki-backups ./backup_postgres.sh
#
# Le dump est gzippé, horodaté, et envoyé vers R2 via aws-cli
# (configuré pour R2 via --endpoint-url).
#
# Rétention : on garde 30 jours. Les fichiers plus vieux sont
# purgés via R2 lifecycle (à configurer côté R2 dashboard).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERREUR: DATABASE_URL non défini"
  exit 1
fi
if [ -z "${R2_BUCKET:-}" ]; then
  echo "ERREUR: R2_BUCKET non défini"
  exit 1
fi
R2_ENDPOINT="${R2_ENDPOINT:-https://<accountid>.r2.cloudflarestorage.com}"

# Parse l'URL pour récupérer host/user/db (format postgres://user:pass@host:port/db).
PG_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^/]+)/.*|\1|')
PG_DB=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+).*|\1|')
PG_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
PG_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')

DUMP_FILE="medanki-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
TMP_PATH="/tmp/$DUMP_FILE"

echo "[$(date -Iseconds)] Début du backup $DUMP_FILE"

# Dump.
PGPASSWORD="$PG_PASS" pg_dump \
  -h "$PG_HOST" \
  -U "$PG_USER" \
  -d "$PG_DB" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip > "$TMP_PATH"

DUMP_SIZE=$(stat -c %s "$TMP_PATH" 2>/dev/null || stat -f %z "$TMP_PATH")
echo "[$(date -Iseconds)] Dump terminé : $DUMP_SIZE octets"

# Upload vers R2.
aws s3 cp "$TMP_PATH" "s3://${R2_BUCKET}/postgres/${DUMP_FILE}" \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors

# Cleanup local.
rm -f "$TMP_PATH"

echo "[$(date -Iseconds)] Backup uploadé vers R2 : postgres/${DUMP_FILE}"

# Cleanup des backups > 30 jours (optionnel, R2 lifecycle fait
# normalement le job).
if [ -n "${RETENTION_DAYS:-30}" ]; then
  CUTOFF=$(date -u -d "$RETENTION_DAYS days ago" +%Y%m%dT%H%M%SZ 2>/dev/null || \
           date -u -v -${RETENTION_DAYS}d +%Y%m%dT%H%M%SZ)
  echo "[$(date -Iseconds)] Rétention : suppression des backups < $CUTOFF"
  aws s3 ls "s3://${R2_BUCKET}/postgres/" --endpoint-url "$R2_ENDPOINT" | \
    awk '{print $4}' | \
    while read -r f; do
      fdate=$(echo "$f" | grep -oE '[0-9]{8}T[0-9]{6}Z' || true)
      if [ -n "$fdate" ] && [ "$fdate" \< "$CUTOFF" ]; then
        echo "  suppression $f"
        aws s3 rm "s3://${R2_BUCKET}/postgres/${f}" --endpoint-url "$R2_ENDPOINT" --only-show-errors
      fi
    done
fi

echo "[$(date -Iseconds)] Backup terminé"
