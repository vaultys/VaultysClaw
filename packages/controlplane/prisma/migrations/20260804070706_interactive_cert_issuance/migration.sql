-- AlterTable
ALTER TABLE "CapabilityCertificate" ADD COLUMN     "certFormat" TEXT NOT NULL DEFAULT 'packcert',
ALTER COLUMN "requestCertificate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3);
