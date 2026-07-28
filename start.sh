#!/usr/bin/env bash
# One command to run the whole app for review:
#   ./start.sh
# Starts MongoDB (single-node replica set rs0), seeds demo data the first time,
# builds the client, and starts the server (which serves the app at :5000).
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="$HOME/.crm-data/mongo"          # stable data dir — your data persists here
DB="garments_day_end"
MONGOD="$(command -v mongod || echo "$HOME/mongodb/bin/mongod")"
MONGOSH="$(command -v mongosh || echo mongosh)"

mkdir -p "$DATA"

echo "▶ MongoDB…"
if ! lsof -iTCP:27017 -sTCP:LISTEN >/dev/null 2>&1; then
  "$MONGOD" --dbpath "$DATA" --replSet rs0 --bind_ip 127.0.0.1 --port 27017 \
    --fork --logpath "$DATA/mongod.log" >/dev/null
fi
# Initialise the replica set once, then wait until it is primary.
"$MONGOSH" --quiet --eval \
  'try { rs.status() } catch (e) { rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]}) }' \
  >/dev/null 2>&1 || true
until "$MONGOSH" --quiet --eval 'rs.isMaster().ismaster' 2>/dev/null | grep -q true; do sleep 1; done

# Seed the first time only (empty database).
COUNT="$("$MONGOSH" "$DB" --quiet --eval 'db.products.countDocuments()' 2>/dev/null || echo 0)"
if [ "$COUNT" = "0" ]; then
  echo "▶ Seeding masters + admin + demo…"
  ( cd "$ROOT" && npm run seed:masters -w server && npm run seed:admin -w server && npm run seed:demo -w server )
fi

echo "▶ Building client…"
( cd "$ROOT" && npm run build -w client >/dev/null )

echo ""
echo "✅ Open  http://localhost:5000   (login: admin@shop.local / admin12345)"
echo "   Press Ctrl+C to stop the server."
echo ""
( sleep 4 && command -v open >/dev/null && open http://localhost:5000 ) &

exec npm start -w server
