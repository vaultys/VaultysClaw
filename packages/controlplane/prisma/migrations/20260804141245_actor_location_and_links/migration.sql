-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "locationLabel" TEXT,
ADD COLUMN     "locationLat" DOUBLE PRECISION,
ADD COLUMN     "locationLon" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ActorLink" (
    "id" TEXT NOT NULL,
    "fromDid" TEXT NOT NULL,
    "toDid" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActorLink_fromDid_idx" ON "ActorLink"("fromDid");

-- CreateIndex
CREATE INDEX "ActorLink_toDid_idx" ON "ActorLink"("toDid");

-- AddForeignKey
ALTER TABLE "ActorLink" ADD CONSTRAINT "ActorLink_fromDid_fkey" FOREIGN KEY ("fromDid") REFERENCES "Actor"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorLink" ADD CONSTRAINT "ActorLink_toDid_fkey" FOREIGN KEY ("toDid") REFERENCES "Actor"("did") ON DELETE CASCADE ON UPDATE CASCADE;
