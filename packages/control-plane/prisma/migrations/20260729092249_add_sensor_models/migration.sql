-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'agent';

-- CreateTable
CREATE TABLE "SensorDevice" (
    "did" TEXT NOT NULL,
    "name" TEXT,
    "hostname" TEXT,
    "os" TEXT,
    "assignedUserId" TEXT,
    "workspaceId" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorDevice_pkey" PRIMARY KEY ("did")
);

-- CreateTable
CREATE TABLE "SensorWorkload" (
    "id" TEXT NOT NULL,
    "deviceDid" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "processName" TEXT,
    "executable" TEXT,
    "command" TEXT,
    "osUser" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "aiConfidence" DOUBLE PRECISION NOT NULL,
    "agentConfidence" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "isMcp" BOOLEAN NOT NULL DEFAULT false,
    "mcpServers" JSONB,
    "isLocalRuntime" BOOLEAN NOT NULL DEFAULT false,
    "lastEventType" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorWorkload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SensorDevice_assignedUserId_idx" ON "SensorDevice"("assignedUserId");

-- CreateIndex
CREATE INDEX "SensorDevice_workspaceId_idx" ON "SensorDevice"("workspaceId");

-- CreateIndex
CREATE INDEX "SensorWorkload_deviceDid_idx" ON "SensorWorkload"("deviceDid");

-- CreateIndex
CREATE UNIQUE INDEX "SensorWorkload_deviceDid_fingerprint_key" ON "SensorWorkload"("deviceDid", "fingerprint");

-- AddForeignKey
ALTER TABLE "SensorDevice" ADD CONSTRAINT "SensorDevice_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorDevice" ADD CONSTRAINT "SensorDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorWorkload" ADD CONSTRAINT "SensorWorkload_deviceDid_fkey" FOREIGN KEY ("deviceDid") REFERENCES "SensorDevice"("did") ON DELETE CASCADE ON UPDATE CASCADE;
