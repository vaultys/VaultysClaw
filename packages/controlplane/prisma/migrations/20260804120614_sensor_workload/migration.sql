-- CreateTable
CREATE TABLE "SensorWorkload" (
    "id" TEXT NOT NULL,
    "deviceDid" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "processExecutable" TEXT,
    "processCommand" TEXT,
    "processUser" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "aiConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "agentConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "isMcp" BOOLEAN NOT NULL DEFAULT false,
    "mcpServers" JSONB NOT NULL DEFAULT '[]',
    "isLocalRuntime" BOOLEAN NOT NULL DEFAULT false,
    "identityEvidence" TEXT,
    "lastEventType" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorWorkload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SensorWorkload_deviceDid_idx" ON "SensorWorkload"("deviceDid");

-- CreateIndex
CREATE UNIQUE INDEX "SensorWorkload_deviceDid_fingerprint_key" ON "SensorWorkload"("deviceDid", "fingerprint");

-- AddForeignKey
ALTER TABLE "SensorWorkload" ADD CONSTRAINT "SensorWorkload_deviceDid_fkey" FOREIGN KEY ("deviceDid") REFERENCES "Actor"("did") ON DELETE CASCADE ON UPDATE CASCADE;
