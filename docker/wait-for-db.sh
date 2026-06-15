#!/bin/sh
# wait-for-db.sh — probe postgres TCP before starting the app.
# Avoids P1001 races where postgres healthcheck passes on loopback
# but the bridge-network TCP socket isn't ready yet for other containers.
#
# Usage: wait-for-db [command ...]
#   DB_HOST  (default: postgres)
#   DB_PORT  (default: 5432)

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"

echo "wait-for-db: probing $DB_HOST:$DB_PORT ..."
until node -e "
  const net = require('net');
  const s = net.createConnection($DB_PORT, '$DB_HOST');
  s.on('connect', function() { s.destroy(); process.exit(0); });
  s.on('error',   function() { s.destroy(); process.exit(1); });
" 2>/dev/null; do
  echo "wait-for-db: $DB_HOST:$DB_PORT not reachable, retrying in 2s..."
  sleep 2
done

echo "wait-for-db: $DB_HOST:$DB_PORT is up — starting app."
exec "$@"
