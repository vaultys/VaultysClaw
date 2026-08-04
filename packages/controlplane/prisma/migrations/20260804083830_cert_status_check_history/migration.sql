-- AlterTable
ALTER TABLE "Actor" RENAME CONSTRAINT "Principal_pkey" TO "Actor_pkey";

-- CreateTable
CREATE TABLE "CertStatusCheck" (
    "id" TEXT NOT NULL,
    "certId" TEXT NOT NULL,
    "requesterDid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertStatusCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CertStatusCheck_certId_checkedAt_idx" ON "CertStatusCheck"("certId", "checkedAt");

-- RenameForeignKey
ALTER TABLE "Actor" RENAME CONSTRAINT "Principal_workspaceId_fkey" TO "Actor_workspaceId_fkey";

-- AddForeignKey
ALTER TABLE "CertStatusCheck" ADD CONSTRAINT "CertStatusCheck_certId_fkey" FOREIGN KEY ("certId") REFERENCES "CapabilityCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Principal_kind_idx" RENAME TO "Actor_kind_idx";

-- RenameIndex
ALTER INDEX "Principal_workspaceId_idx" RENAME TO "Actor_workspaceId_idx";
