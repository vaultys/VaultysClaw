-- Add daily_price_spent column to agents table
ALTER TABLE "agents" ADD COLUMN "daily_price_spent" DOUBLE PRECISION DEFAULT 0;
