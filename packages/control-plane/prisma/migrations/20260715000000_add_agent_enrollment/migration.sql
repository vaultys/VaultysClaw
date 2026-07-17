-- Enrollment binding for user-initiated (local AI) agents.
-- Set when a user creates an agent via the enrollment flow: on admin approval
-- the agent is enrolled into this (personal) workspace instead of the default.
ALTER TABLE "PendingRegistration" ADD COLUMN "initiatedByUserId" TEXT;
ALTER TABLE "PendingRegistration" ADD COLUMN "targetWorkspaceId" TEXT;
