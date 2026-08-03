-- CreateTable
CREATE TABLE "AuthCertificate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "registration" TEXT,
    "connection" TEXT,
    "register" INTEGER NOT NULL DEFAULT 1,
    "data" TEXT NOT NULL DEFAULT '',
    "status" INTEGER NOT NULL DEFAULT -1,
    "metadata" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthCertificate_registration_key" ON "AuthCertificate"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "AuthCertificate_connection_key" ON "AuthCertificate"("connection");
