-- Replace UserWorkspace.isWorkspaceAdmin (boolean) with a three-level role
-- ("Owner" | "Admin" | "Member"). Data-preserving.

-- 1. Add the new column with the safe default.
ALTER TABLE "UserWorkspace" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'Member';

-- 2. Current admins become Admin.
UPDATE "UserWorkspace" SET "role" = 'Admin' WHERE "isWorkspaceAdmin" = true;

-- 3. Promote the earliest admin member of each workspace to Owner. This makes
--    the personal-workspace user (first & only admin) the Owner, and picks a
--    single Owner for any other workspace that had admins.
UPDATE "UserWorkspace" uw
SET "role" = 'Owner'
FROM (
  SELECT DISTINCT ON ("workspaceId") "workspaceId", "userId"
  FROM "UserWorkspace"
  WHERE "isWorkspaceAdmin" = true
  ORDER BY "workspaceId", "joinedAt" ASC
) o
WHERE uw."workspaceId" = o."workspaceId" AND uw."userId" = o."userId";

-- 4. Drop the old boolean.
ALTER TABLE "UserWorkspace" DROP COLUMN "isWorkspaceAdmin";
