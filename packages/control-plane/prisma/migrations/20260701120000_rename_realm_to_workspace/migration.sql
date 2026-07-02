-- Rename "Realm" domain to "Workspace" (data-preserving).
-- Renames tables, columns, primary keys, foreign keys, unique indexes and indexes.

-- ─── Tables ─────────────────────────────────────────────────────────────────
ALTER TABLE "Realm" RENAME TO "Workspace";
ALTER TABLE "RealmTokenUsage" RENAME TO "WorkspaceTokenUsage";
ALTER TABLE "AgentRealm" RENAME TO "AgentWorkspace";
ALTER TABLE "UserRealm" RENAME TO "UserWorkspace";
ALTER TABLE "RealmSkill" RENAME TO "WorkspaceSkill";
ALTER TABLE "ModelRealmAccess" RENAME TO "ModelWorkspaceAccess";
ALTER TABLE "RealmRouterKey" RENAME TO "WorkspaceRouterKey";

-- ─── Columns ────────────────────────────────────────────────────────────────
ALTER TABLE "WorkspaceTokenUsage" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "AgentWorkspace" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "UserWorkspace" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "UserWorkspace" RENAME COLUMN "isRealmAdmin" TO "isWorkspaceAdmin";
ALTER TABLE "WorkspaceSkill" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "ModelWorkspaceAccess" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "WorkspaceRouterKey" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "AgentSkillOverride" RENAME COLUMN "realmSkillId" TO "workspaceSkillId";
ALTER TABLE "Channel" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "Credential" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "KnowledgeSource" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "Policy" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "Workflow" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "ApiKey" RENAME COLUMN "realmId" TO "workspaceId";
ALTER TABLE "ApiKey" RENAME COLUMN "isRealmAdmin" TO "isWorkspaceAdmin";

-- ─── Primary keys ─────────────────────────────────────────────────────────────
ALTER TABLE "Workspace" RENAME CONSTRAINT "Realm_pkey" TO "Workspace_pkey";
ALTER TABLE "WorkspaceTokenUsage" RENAME CONSTRAINT "RealmTokenUsage_pkey" TO "WorkspaceTokenUsage_pkey";
ALTER TABLE "AgentWorkspace" RENAME CONSTRAINT "AgentRealm_pkey" TO "AgentWorkspace_pkey";
ALTER TABLE "UserWorkspace" RENAME CONSTRAINT "UserRealm_pkey" TO "UserWorkspace_pkey";
ALTER TABLE "WorkspaceSkill" RENAME CONSTRAINT "RealmSkill_pkey" TO "WorkspaceSkill_pkey";
ALTER TABLE "ModelWorkspaceAccess" RENAME CONSTRAINT "ModelRealmAccess_pkey" TO "ModelWorkspaceAccess_pkey";
ALTER TABLE "WorkspaceRouterKey" RENAME CONSTRAINT "RealmRouterKey_pkey" TO "WorkspaceRouterKey_pkey";

-- ─── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "WorkspaceTokenUsage" RENAME CONSTRAINT "RealmTokenUsage_realmId_fkey" TO "WorkspaceTokenUsage_workspaceId_fkey";
ALTER TABLE "AgentWorkspace" RENAME CONSTRAINT "AgentRealm_agentDid_fkey" TO "AgentWorkspace_agentDid_fkey";
ALTER TABLE "AgentWorkspace" RENAME CONSTRAINT "AgentRealm_realmId_fkey" TO "AgentWorkspace_workspaceId_fkey";
ALTER TABLE "UserWorkspace" RENAME CONSTRAINT "UserRealm_userId_fkey" TO "UserWorkspace_userId_fkey";
ALTER TABLE "UserWorkspace" RENAME CONSTRAINT "UserRealm_realmId_fkey" TO "UserWorkspace_workspaceId_fkey";
ALTER TABLE "WorkspaceSkill" RENAME CONSTRAINT "RealmSkill_realmId_fkey" TO "WorkspaceSkill_workspaceId_fkey";
ALTER TABLE "ModelWorkspaceAccess" RENAME CONSTRAINT "ModelRealmAccess_modelId_fkey" TO "ModelWorkspaceAccess_modelId_fkey";
ALTER TABLE "ModelWorkspaceAccess" RENAME CONSTRAINT "ModelRealmAccess_realmId_fkey" TO "ModelWorkspaceAccess_workspaceId_fkey";
ALTER TABLE "WorkspaceRouterKey" RENAME CONSTRAINT "RealmRouterKey_realmId_fkey" TO "WorkspaceRouterKey_workspaceId_fkey";
ALTER TABLE "AgentSkillOverride" RENAME CONSTRAINT "AgentSkillOverride_realmSkillId_fkey" TO "AgentSkillOverride_workspaceSkillId_fkey";
ALTER TABLE "Channel" RENAME CONSTRAINT "Channel_realmId_fkey" TO "Channel_workspaceId_fkey";
ALTER TABLE "Credential" RENAME CONSTRAINT "Credential_realmId_fkey" TO "Credential_workspaceId_fkey";
ALTER TABLE "KnowledgeSource" RENAME CONSTRAINT "KnowledgeSource_realmId_fkey" TO "KnowledgeSource_workspaceId_fkey";
ALTER TABLE "Policy" RENAME CONSTRAINT "Policy_realmId_fkey" TO "Policy_workspaceId_fkey";
ALTER TABLE "Workflow" RENAME CONSTRAINT "Workflow_realmId_fkey" TO "Workflow_workspaceId_fkey";

-- ─── Unique indexes ─────────────────────────────────────────────────────────────
ALTER INDEX "Realm_slug_key" RENAME TO "Workspace_slug_key";
ALTER INDEX "RealmSkill_realmId_name_key" RENAME TO "WorkspaceSkill_workspaceId_name_key";
ALTER INDEX "Channel_realmId_slug_key" RENAME TO "Channel_workspaceId_slug_key";
ALTER INDEX "Credential_realmId_service_name_key" RENAME TO "Credential_workspaceId_service_name_key";

-- ─── Indexes ────────────────────────────────────────────────────────────────
ALTER INDEX "ModelRealmAccess_realmId_idx" RENAME TO "ModelWorkspaceAccess_workspaceId_idx";
ALTER INDEX "Channel_realmId_idx" RENAME TO "Channel_workspaceId_idx";
ALTER INDEX "Credential_realmId_idx" RENAME TO "Credential_workspaceId_idx";
ALTER INDEX "KnowledgeSource_realmId_idx" RENAME TO "KnowledgeSource_workspaceId_idx";
ALTER INDEX "Policy_realmId_idx" RENAME TO "Policy_workspaceId_idx";
ALTER INDEX "Workflow_realmId_idx" RENAME TO "Workflow_workspaceId_idx";
ALTER INDEX "ApiKey_realmId_idx" RENAME TO "ApiKey_workspaceId_idx";
