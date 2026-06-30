-- Consolidate user access control into a single `role` column.
-- Allowed values going forward: 'Owner', 'Admin', 'Member'.

-- 1. Fold the boolean flags into `role` before dropping them.
UPDATE "User" SET "role" = CASE
  WHEN "isOwner" THEN 'Owner'
  WHEN "isAdmin" THEN 'Admin'
  ELSE 'Member'
END;

-- 2. Drop the now-redundant boolean columns.
ALTER TABLE "User" DROP COLUMN "isOwner";
ALTER TABLE "User" DROP COLUMN "isAdmin";

-- 3. New default.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'Member';

-- 4. Normalise pending invitation roles to the new enum.
UPDATE "UserInvitation" SET "role" = CASE
  WHEN lower("role") = 'owner' THEN 'Owner'
  WHEN lower("role") = 'admin' THEN 'Admin'
  ELSE 'Member'
END;

ALTER TABLE "UserInvitation" ALTER COLUMN "role" SET DEFAULT 'Member';
