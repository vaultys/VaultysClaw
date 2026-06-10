-- Add signature column to intent_log to store the ECDSA-signed intent token
ALTER TABLE "intent_log" ADD COLUMN "signature" TEXT;
