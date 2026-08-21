#!/usr/bin/env bash
# Restores a database dump (and optionally an uploads archive) produced by
# ops/backup.sh. DESTRUCTIVE: drops and recreates every table in the target
# database. Requires --yes-really so it can never run by accident.
#
# Usage:
#   ./ops/restore.sh --yes-really db-20260821T120000Z.dump [uploads-20260821T120000Z.tar.gz]
#   ./ops/restore.sh --yes-really latest              # restores the newest backup pair
#
# Config: same env vars as backup.sh (BACKUP_DIR, POSTGRES_CONTAINER,
# POSTGRES_USER, POSTGRES_DB, UPLOADS_DIR).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-shankara-postgres}"
POSTGRES_USER="${POSTGRES_USER:-shankara_admin}"
POSTGRES_DB="${POSTGRES_DB:-shankara_erp}"
UPLOADS_DIR="${UPLOADS_DIR:-$REPO_ROOT/backend/var/uploads}"

if [ "${1:-}" != "--yes-really" ]; then
  echo "This will DROP AND RECREATE every table in '$POSTGRES_DB' on container '$POSTGRES_CONTAINER'." >&2
  echo "Re-run with --yes-really as the first argument to actually do this:" >&2
  echo "  $0 --yes-really <db-dump-file>|latest [uploads-tar-file]" >&2
  exit 1
fi
shift

DB_ARG="${1:-}"
UPLOADS_ARG="${2:-}"

if [ -z "$DB_ARG" ]; then
  echo "ERROR: no dump file given. Pass a filename from $BACKUP_DIR, or 'latest'." >&2
  exit 1
fi

if [ "$DB_ARG" = "latest" ]; then
  DB_DUMP="$(ls -1t "$BACKUP_DIR"/db-*.dump 2>/dev/null | head -n1 || true)"
  UPLOADS_TAR="$(ls -1t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | head -n1 || true)"
  if [ -z "$DB_DUMP" ]; then
    echo "ERROR: no db-*.dump files found in $BACKUP_DIR" >&2
    exit 1
  fi
else
  DB_DUMP="$BACKUP_DIR/$DB_ARG"
  UPLOADS_TAR="${UPLOADS_ARG:+$BACKUP_DIR/$UPLOADS_ARG}"
fi

if [ ! -f "$DB_DUMP" ]; then
  echo "ERROR: dump file not found: $DB_DUMP" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "ERROR: container '$POSTGRES_CONTAINER' is not running." >&2
  exit 1
fi

echo "[restore] restoring $DB_DUMP into '$POSTGRES_DB' on '$POSTGRES_CONTAINER'"
# pg_restore prints "cannot drop inherited constraint" warnings for
# pgboss.queue_stats_* / job_common (pg-boss's own partitioned internal
# job-queue bookkeeping tables, not application data) and — critically —
# exits non-zero when it does, even though the restore of everything else
# succeeded. Verified live: all real tables (app_user/voucher/
# item_master_row/audit_event/etc) restore correctly despite this. So this
# command runs with errexit off, and only a stderr line we don't recognize
# as that known-safe case is treated as a real failure.
RESTORE_STDERR="$(mktemp)"
set +e
docker exec -i "$POSTGRES_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$DB_DUMP" 2> "$RESTORE_STDERR"
RESTORE_EXIT=$?
set -e
cat "$RESTORE_STDERR" >&2
if [ $RESTORE_EXIT -ne 0 ]; then
  if grep -qvE "queue_stats_[0-9]+|job_common|errors ignored on restore|^$" "$RESTORE_STDERR"; then
    echo "[restore] ERROR: pg_restore failed with an error that isn't the known-safe pg-boss partition warning — see output above. Aborting." >&2
    rm -f "$RESTORE_STDERR"
    exit 1
  fi
  echo "[restore] pg_restore reported only the known-safe pg-boss partition warnings, continuing"
fi
rm -f "$RESTORE_STDERR"
echo "[restore] database restored"

if [ -n "$UPLOADS_TAR" ] && [ -f "$UPLOADS_TAR" ]; then
  echo "[restore] restoring uploads from $UPLOADS_TAR -> $UPLOADS_DIR"
  rm -rf "$UPLOADS_DIR"
  mkdir -p "$(dirname "$UPLOADS_DIR")"
  tar -xzf "$UPLOADS_TAR" -C "$(dirname "$UPLOADS_DIR")"
  echo "[restore] uploads restored"
else
  echo "[restore] no uploads archive given/found — database only"
fi

echo "[restore] done"
