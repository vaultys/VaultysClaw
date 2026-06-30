-- Add policy-decision audit columns to IntentLog:
--   decision: ALLOW | DENY (deny-by-default policy decision point)
--   reason:   human-readable explanation for a DENY
ALTER TABLE "IntentLog" ADD COLUMN "decision" TEXT;
ALTER TABLE "IntentLog" ADD COLUMN "reason" TEXT;
