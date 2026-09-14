-- `SrtTemplateWorkspace` goes from "one default per workspace" (workspaceId as
-- the primary key) to "N templates attached, at most one of them the default".

ALTER TABLE "SrtTemplateWorkspace" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Every existing row *was*, by construction, its workspace's default.
UPDATE "SrtTemplateWorkspace" SET "isDefault" = true;

ALTER TABLE "SrtTemplateWorkspace" DROP CONSTRAINT "SrtTemplateWorkspace_pkey";
ALTER TABLE "SrtTemplateWorkspace"
  ADD CONSTRAINT "SrtTemplateWorkspace_pkey" PRIMARY KEY ("workspaceId", "templateId");

-- The "at most one default per workspace" invariant, held by the database
-- rather than by the DAO. Partial indexes have no Prisma schema equivalent, so
-- this exists only here.
CREATE UNIQUE INDEX "SrtTemplateWorkspace_one_default_per_workspace"
  ON "SrtTemplateWorkspace"("workspaceId") WHERE "isDefault";
