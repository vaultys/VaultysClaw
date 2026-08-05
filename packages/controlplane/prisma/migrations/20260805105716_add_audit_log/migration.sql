-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorDid" TEXT,
    "actorName" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_actorDid_idx" ON "AuditLogEntry"("actorDid");

-- CreateIndex
CREATE INDEX "AuditLogEntry_eventType_idx" ON "AuditLogEntry"("eventType");

-- CreateIndex
CREATE INDEX "AuditLogEntry_targetType_targetId_idx" ON "AuditLogEntry"("targetType", "targetId");
