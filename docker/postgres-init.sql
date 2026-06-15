-- Creates the dedicated LiteLLM database alongside the main vaultysclaw DB.
-- This script runs once on first volume init (postgres docker-entrypoint-initdb.d).
SELECT 'CREATE DATABASE vaultysclaw_litellm OWNER vaultys'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'vaultysclaw_litellm'
)\gexec
