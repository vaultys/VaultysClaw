-- CreateTable
CREATE TABLE "OidcIdentity" (
    "sub" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OidcIdentity_pkey" PRIMARY KEY ("sub")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "oidcId" TEXT;

-- CreateIndex
CREATE INDEX "User_oidcId_idx" ON "User"("oidcId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_oidcId_fkey" FOREIGN KEY ("oidcId") REFERENCES "OidcIdentity"("sub") ON DELETE SET NULL ON UPDATE CASCADE;
