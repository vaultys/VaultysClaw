-- CreateTable
CREATE TABLE "HookCoverage" (
    "actorDid" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tamperResistant" BOOLEAN NOT NULL,
    "vendors" JSONB NOT NULL,

    CONSTRAINT "HookCoverage_pkey" PRIMARY KEY ("actorDid")
);

-- AddForeignKey
ALTER TABLE "HookCoverage" ADD CONSTRAINT "HookCoverage_actorDid_fkey" FOREIGN KEY ("actorDid") REFERENCES "Actor"("did") ON DELETE CASCADE ON UPDATE CASCADE;
