-- CreateTable
CREATE TABLE "KillSwitch" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "workspaceId" TEXT,
    "reason" TEXT NOT NULL,
    "armedBy" TEXT NOT NULL,
    "armedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KillSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KillSwitch_workspaceId_key" ON "KillSwitch"("workspaceId");

-- AddForeignKey
ALTER TABLE "KillSwitch" ADD CONSTRAINT "KillSwitch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
