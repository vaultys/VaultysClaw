#!/bin/sh
# litellm-entrypoint.sh — wait for postgres TCP before starting LiteLLM.
# The Wolfi-based LiteLLM image starts its Prisma engine immediately;
# if postgres isn't reachable yet the process exits with code 3.
# This wrapper ensures TCP connectivity before handing off to litellm.

if [ -n "$DATABASE_URL" ]; then
  # Parse host and port from: postgresql://user:pass@host:port/db
  DB_HOST=$(echo "$DATABASE_URL" | sed 's|.*@\([^:@/]*\).*|\1|')
  DB_PORT=$(echo "$DATABASE_URL" | sed 's|.*:\([0-9]*\)/.*|\1|')
  DB_HOST="${DB_HOST:-postgres}"
  DB_PORT="${DB_PORT:-5432}"

  echo "litellm-entrypoint: waiting for $DB_HOST:$DB_PORT ..."
  i=0
  while ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
    i=$((i+1))
    echo "  attempt $i: $DB_HOST:$DB_PORT not ready, retrying in 2s..."
    sleep 2
  done
  echo "litellm-entrypoint: $DB_HOST:$DB_PORT is reachable — starting LiteLLM."
fi

exec litellm "$@"
