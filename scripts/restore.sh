#!/usr/bin/env bash
# Restore the database from a backup folder created by backup.sh.
#
#   ./scripts/restore.sh backups/20260722-140000
#
# ⚠️  This REPLACES the current data (mongorestore --drop). It asks you to type
#     RESTORE to confirm. Take a fresh backup first if you're unsure.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-}"

if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "Usage: ./scripts/restore.sh <backup-folder>" >&2
  echo "Available backups:" >&2
  ls -1 "$ROOT/backups" 2>/dev/null | sed 's/^/  backups\//' >&2 || echo "  (none)" >&2
  exit 1
fi

if [ -z "${MONGODB_URI:-}" ] && [ -f "$ROOT/server/.env" ]; then
  MONGODB_URI="$(grep -E '^MONGODB_URI=' "$ROOT/server/.env" | head -1 | cut -d= -f2-)"
fi
if [ -z "${MONGODB_URI:-}" ]; then
  echo "✖ MONGODB_URI is not set (and not found in server/.env)." >&2
  exit 1
fi

echo "⚠️  This will REPLACE all current data with the backup in: $SRC"
printf "   Type RESTORE to proceed: "
read -r REPLY
if [ "$REPLY" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

echo "▶ Restoring from $SRC …"
mongorestore --uri="$MONGODB_URI" --drop --quiet "$SRC"
echo "✅ Restore complete."
