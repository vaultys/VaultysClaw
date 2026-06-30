-- Linked device identities: a user can link many VaultysIds that act in their name.
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "publicKey" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserDevice_did_key" ON "UserDevice"("did");
CREATE INDEX "UserDevice_userId_idx" ON "UserDevice"("userId");
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pending link requests approved via an invite-style URL.
CREATE TABLE "DeviceLinkRequest" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "publicKey" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeviceLinkRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeviceLinkRequest_did_idx" ON "DeviceLinkRequest"("did");
