-- Add per-agent LiteLLM virtual key columns
ALTER TABLE "agents" ADD COLUMN "litellm_virtual_key" TEXT;
ALTER TABLE "agents" ADD COLUMN "litellm_allowed_models" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "agents" ADD COLUMN "litellm_daily_budget" DOUBLE PRECISION;
ALTER TABLE "agents" ADD COLUMN "litellm_key_updated_at" TIMESTAMP(3);
