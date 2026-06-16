-- Add userId FK to UserInvitation so each invite is linked to its unclaimed User record
ALTER TABLE "UserInvitation" ADD COLUMN "userId" TEXT;

ALTER TABLE "UserInvitation"
  ADD CONSTRAINT "UserInvitation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "UserInvitation_userId_idx" ON "UserInvitation"("userId");
