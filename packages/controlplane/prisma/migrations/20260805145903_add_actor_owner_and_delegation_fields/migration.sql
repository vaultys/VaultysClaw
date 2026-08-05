-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "ownerDid" TEXT;

-- AlterTable
ALTER TABLE "CapabilityCertificate" ADD COLUMN     "delegatedByDid" TEXT,
ADD COLUMN     "parentCertHash" TEXT,
ADD COLUMN     "parentCertId" TEXT;

-- CreateIndex
CREATE INDEX "Actor_ownerDid_idx" ON "Actor"("ownerDid");

-- CreateIndex
CREATE INDEX "CapabilityCertificate_parentCertId_idx" ON "CapabilityCertificate"("parentCertId");

-- AddForeignKey
ALTER TABLE "Actor" ADD CONSTRAINT "Actor_ownerDid_fkey" FOREIGN KEY ("ownerDid") REFERENCES "Actor"("did") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityCertificate" ADD CONSTRAINT "CapabilityCertificate_parentCertId_fkey" FOREIGN KEY ("parentCertId") REFERENCES "CapabilityCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
