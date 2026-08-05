-- CreateTable
CREATE TABLE "Invitation" (
    "tokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '["portal_access"]',
    "workspaceId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedDid" TEXT,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");
