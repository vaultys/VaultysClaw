-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'agent';

-- CreateTable
CREATE TABLE "Proxy" (
    "did" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicKey" TEXT,
    "defaultMode" TEXT NOT NULL DEFAULT 'deny',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proxy_pkey" PRIMARY KEY ("did")
);

-- CreateTable
CREATE TABLE "ProxyUpstream" (
    "id" TEXT NOT NULL,
    "proxyDid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,

    CONSTRAINT "ProxyUpstream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyRule" (
    "id" TEXT NOT NULL,
    "proxyDid" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "urlPattern" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "governanceRule" TEXT,
    "principalIdSource" JSONB,

    CONSTRAINT "ProxyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyPrincipal" (
    "id" TEXT NOT NULL,
    "proxyDid" TEXT NOT NULL,
    "tag" TEXT,
    "externalId" TEXT,
    "did" TEXT NOT NULL,
    "governanceRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provisionedByProxy" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProxyPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyActivityLog" (
    "id" TEXT NOT NULL,
    "proxyDid" TEXT NOT NULL,
    "principalDid" TEXT,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ruleId" TEXT,
    "mode" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT,
    "identitySource" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latencyMs" INTEGER,

    CONSTRAINT "ProxyActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProxyUpstream_proxyDid_idx" ON "ProxyUpstream"("proxyDid");

-- CreateIndex
CREATE INDEX "ProxyRule_proxyDid_idx" ON "ProxyRule"("proxyDid");

-- CreateIndex
CREATE INDEX "ProxyPrincipal_proxyDid_idx" ON "ProxyPrincipal"("proxyDid");

-- CreateIndex
CREATE UNIQUE INDEX "ProxyPrincipal_proxyDid_did_key" ON "ProxyPrincipal"("proxyDid", "did");

-- CreateIndex
CREATE INDEX "ProxyActivityLog_proxyDid_idx" ON "ProxyActivityLog"("proxyDid");

-- CreateIndex
CREATE INDEX "ProxyActivityLog_principalDid_idx" ON "ProxyActivityLog"("principalDid");

-- AddForeignKey
ALTER TABLE "ProxyUpstream" ADD CONSTRAINT "ProxyUpstream_proxyDid_fkey" FOREIGN KEY ("proxyDid") REFERENCES "Proxy"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_proxyDid_fkey" FOREIGN KEY ("proxyDid") REFERENCES "Proxy"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyPrincipal" ADD CONSTRAINT "ProxyPrincipal_proxyDid_fkey" FOREIGN KEY ("proxyDid") REFERENCES "Proxy"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyActivityLog" ADD CONSTRAINT "ProxyActivityLog_proxyDid_fkey" FOREIGN KEY ("proxyDid") REFERENCES "Proxy"("did") ON DELETE CASCADE ON UPDATE CASCADE;
