-- CreateTable
CREATE TABLE "SrtTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "settings" JSONB NOT NULL,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SrtTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SrtTemplateWorkspace" (
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SrtTemplateWorkspace_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SrtTemplate_name_key" ON "SrtTemplate"("name");

-- CreateIndex
CREATE INDEX "SrtTemplate_name_idx" ON "SrtTemplate"("name");

-- CreateIndex
CREATE INDEX "SrtTemplateWorkspace_templateId_idx" ON "SrtTemplateWorkspace"("templateId");

-- AddForeignKey
ALTER TABLE "SrtTemplateWorkspace" ADD CONSTRAINT "SrtTemplateWorkspace_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SrtTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SrtTemplateWorkspace" ADD CONSTRAINT "SrtTemplateWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
