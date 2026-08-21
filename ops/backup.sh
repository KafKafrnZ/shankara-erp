#!/usr/bin/env bash
# Backs up the Postgres database and the uploaded-file store.
#
# Runs against the "shankara-postgres" container from docker-compose.yml via
# `docker exec`, so it works on the actual deployed stack without needing a
# separate postgres client installed on the host.
#
# Usage:
#   ./ops/backup.sh
#
# Config (env vars, all optional — defaults match backend/.env.example):
#   BACKUP_DIR            Where backup files land. Default: ./backups
#                          On the real office server, point this at a second
#                          disk or a NAS mount — see ops/README.md.
#   RETENTION_DAYS         How many days of backups to keep. Default: 14
#   POSTGRES_CONTAINER     Container name to exec into. Default: shankara-postgres
#   POSTGRES_USER/DB       Must match docker-compose.yml / backend/.env
#   UPLOADS_DIR             Path to the uploads directory on the HOST
#                           (bind-mounted into the backend container).
#                           Default: backend/var/uploads

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-shankara-postgres}"
POSTGRES_USER="${POSTGRES_USER:-shankara_admin}"
POSTGRES_DB="${POSTGRES_DB:-shankara_erp}"
UPLOADS_DIR="${UPLOADS_DIR:-$REPO_ROOT/backend/var/uploads}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_DUMP="$BACKUP_DIR/db-$TIMESTAMP.dump"
UPLOADS_TAR="$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] $(date -u +%FT%TZ) starting"

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "[backup] ERROR: container '$POSTGRES_CONTAINER' is not running." >&2
  exit 1
fi

echo "[backup] dumping database ($POSTGRES_DB) -> $DB_DUMP"
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DB_DUMP"

if [ ! -s "$DB_DUMP" ]; then
  echo "[backup] ERROR: database dump is empty, aborting before touching uploads." >&2
  rm -f "$DB_DUMP"
  exit 1
fi

if [ -d "$UPLOADS_DIR" ]; then
  echo "[backup] archiving uploads ($UPLOADS_DIR) -> $UPLOADS_TAR"
  tar -czf "$UPLOADS_TAR" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
else
  echo "[backup] WARNING: uploads dir '$UPLOADS_DIR' not found, skipping (nothing uploaded yet?)"
fi

echo "[backup] pruning backups older than $RETENTION_DAYS days in $BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime "+$RETENTION_DAYS" -print -delete

echo "[backup] done: $(du -h "$DB_DUMP" | cut -f1) database, $( [ -f "$UPLOADS_TAR" ] && du -h "$UPLOADS_TAR" | cut -f1 || echo 'n/a' ) uploads"
