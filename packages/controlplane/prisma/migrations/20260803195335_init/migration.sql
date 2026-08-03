-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Principal" (
    "did" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "workspaceId" TEXT,
    "kindConfig" JSONB NOT NULL DEFAULT '{}',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Principal_pkey" PRIMARY KEY ("did")
);

-- CreateTable
CREATE TABLE "User" (
    "did" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("did")
);

-- CreateTable
CREATE TABLE "CapabilityCertificate" (
    "id" TEXT NOT NULL,
    "agentDid" TEXT NOT NULL,
    "workspaceId" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "resourceLimits" JSONB,
    "scope" JSONB,
    "certificate" TEXT NOT NULL,
    "requestCertificate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedReason" TEXT,
    "supersededByCertId" TEXT,

    CONSTRAINT "CapabilityCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedCapabilities" JSONB NOT NULL DEFAULT '[]',
    "assignedCapabilities" JSONB NOT NULL DEFAULT '[]',
    "initiatedByUserId" TEXT,
    "targetWorkspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Principal_kind_idx" ON "Principal"("kind");

-- CreateIndex
CREATE INDEX "Principal_workspaceId_idx" ON "Principal"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CapabilityCertificate_agentDid_status_idx" ON "CapabilityCertificate"("agentDid", "status");

-- CreateIndex
CREATE INDEX "CapabilityCertificate_expiresAt_idx" ON "CapabilityCertificate"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- AddForeignKey
ALTER TABLE "Principal" ADD CONSTRAINT "Principal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_did_fkey" FOREIGN KEY ("did") REFERENCES "Principal"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityCertificate" ADD CONSTRAINT "CapabilityCertificate_agentDid_fkey" FOREIGN KEY ("agentDid") REFERENCES "Principal"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityCertificate" ADD CONSTRAINT "CapabilityCertificate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
