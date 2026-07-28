#!/usr/bin/env bash
# Back up the whole database to a timestamped folder under ./backups/
#
#   ./scripts/backup.sh                 # uses MONGODB_URI from server/.env
#   MONGODB_URI="mongodb+srv://…" ./scripts/backup.sh   # or pass it in
#
# Safe to run anytime (read-only on the DB). Keep these folders somewhere safe
# (copy off the machine / to cloud storage) — they are your restore points.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load MONGODB_URI from server/.env if not already in the environment.
if [ -z "${MONGODB_URI:-}" ] && [ -f "$ROOT/server/.env" ]; then
  MONGODB_URI="$(grep -E '^MONGODB_URI=' "$ROOT/server/.env" | head -1 | cut -d= -f2-)"
fi
if [ -z "${MONGODB_URI:-}" ]; then
  echo "✖ MONGODB_URI is not set (and not found in server/.env)." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/backups/$STAMP"
mkdir -p "$OUT"

echo "▶ Backing up → backups/$STAMP"
mongodump --uri="$MONGODB_URI" --out="$OUT" --quiet

echo "✅ Backup complete: $OUT"
echo "   Restore later with:  ./scripts/restore.sh backups/$STAMP"
