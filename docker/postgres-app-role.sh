#!/bin/sh
# postgres-app-role.sh — give the control plane a NON-superuser database role.
#
# Run once per deploy by the `postgres-roles` one-shot service in docker-compose.yml, before the
# control plane and the dispatcher start. Idempotent, and safe on an existing volume:
#
#   1. creates (or re-passwords) the login role $PG_APP_USER — NOSUPERUSER, NOCREATEDB,
#      NOCREATEROLE, NOREPLICATION, NOBYPASSRLS;
#   2. makes it the owner of the database, of schema `public` and of every table, sequence, type
#      and routine already in it — so `prisma migrate deploy` (which runs as this role) can still
#      ALTER the tables an earlier deploy created as the superuser.
#
# Why: the image's POSTGRES_USER is the cluster's bootstrap superuser, which can run
# `COPY … FROM PROGRAM` (shell on the database host) and read any file the server can. The
# application never needs that, so it no longer connects as it. The superuser password stays in
# use only here and in the healthcheck.
#
# The bootstrap superuser cannot be demoted, and `REASSIGN OWNED BY` it fails (it owns system
# objects), hence the per-object loop below.
set -eu

: "${PGHOST:=postgres}"
: "${PG_DB:=vaultysclaw}"
: "${PG_APP_USER:=vaultysclaw_app}"
: "${PG_APP_PASSWORD:?PG_APP_PASSWORD is required}"
export PGHOST

psql -v ON_ERROR_STOP=1 -d "$PG_DB" \
  -v app_user="$PG_APP_USER" -v app_password="$PG_APP_PASSWORD" -v db="$PG_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'app_user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'app_password';

ALTER DATABASE :"db" OWNER TO :"app_user";
ALTER SCHEMA public OWNER TO :"app_user";

-- Tables first: a sequence OWNED BY a table column follows its table and cannot be moved alone.
SELECT format('ALTER TABLE public.%I OWNER TO %I', c.relname, :'app_user')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
   AND pg_get_userbyid(c.relowner) <> :'app_user' \gexec

SELECT format('ALTER %s public.%I OWNER TO %I',
              CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW'
                             WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'FOREIGN TABLE' END,
              c.relname, :'app_user')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('S', 'v', 'm', 'f')
   AND pg_get_userbyid(c.relowner) <> :'app_user' \gexec

-- Prisma enums (and any domain). Row types of tables follow their table.
SELECT format('ALTER TYPE public.%I OWNER TO %I', t.typname, :'app_user')
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
   AND pg_get_userbyid(t.typowner) <> :'app_user' \gexec

SELECT format('ALTER ROUTINE %s OWNER TO %I', p.oid::regprocedure, :'app_user')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
   AND pg_get_userbyid(p.proowner) <> :'app_user' \gexec
SQL

echo "postgres-app-role: $PG_APP_USER owns $PG_DB (non-superuser)."
