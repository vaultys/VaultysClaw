/*
  Warnings:

  - Added the required column `did` to the `PendingRegistration` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "did" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "PendingRegistration_did_idx" ON "PendingRegistration"("did");
