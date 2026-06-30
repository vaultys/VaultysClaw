-- Track which linked device / identity initiated each intent (for per-device audit views).
ALTER TABLE "IntentLog" ADD COLUMN "initiatorDid" TEXT;
CREATE INDEX "IntentLog_initiatorDid_sentAt_idx" ON "IntentLog"("initiatorDid", "sentAt" DESC);
