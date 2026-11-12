-- CreateTable
CREATE TABLE "HookAuditEvent" (
    "id" TEXT NOT NULL,
    "actorDid" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "session" TEXT,
    "cwd" TEXT,
    "tool" TEXT,
    "capability" TEXT,
    "resource" TEXT,
    "decided" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "wouldDeny" BOOLEAN NOT NULL DEFAULT false,
    "unmapped" BOOLEAN NOT NULL DEFAULT false,
    "floorRefused" BOOLEAN NOT NULL DEFAULT false,
    "ruleId" TEXT,
    "certId" TEXT,
    "reason" TEXT,
    "error" TEXT,

    CONSTRAINT "HookAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HookAuditEvent_actorDid_eventId_key" ON "HookAuditEvent"("actorDid", "eventId");

-- CreateIndex
CREATE INDEX "HookAuditEvent_actorDid_occurredAt_idx" ON "HookAuditEvent"("actorDid", "occurredAt");

-- AddForeignKey
ALTER TABLE "HookAuditEvent" ADD CONSTRAINT "HookAuditEvent_actorDid_fkey" FOREIGN KEY ("actorDid") REFERENCES "Actor"("did") ON DELETE CASCADE ON UPDATE CASCADE;
