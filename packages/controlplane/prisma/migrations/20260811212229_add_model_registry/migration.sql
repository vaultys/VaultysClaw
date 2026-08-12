-- CreateTable
CREATE TABLE "ModelRegistry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyEnc" TEXT,
    "litellmModelName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelWorkspaceAccess" (
    "modelId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelWorkspaceAccess_pkey" PRIMARY KEY ("modelId","workspaceId")
);

-- CreateIndex
CREATE INDEX "ModelRegistry_isActive_idx" ON "ModelRegistry"("isActive");

-- CreateIndex
CREATE INDEX "ModelWorkspaceAccess_workspaceId_idx" ON "ModelWorkspaceAccess"("workspaceId");

-- AddForeignKey
ALTER TABLE "ModelWorkspaceAccess" ADD CONSTRAINT "ModelWorkspaceAccess_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelWorkspaceAccess" ADD CONSTRAINT "ModelWorkspaceAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
