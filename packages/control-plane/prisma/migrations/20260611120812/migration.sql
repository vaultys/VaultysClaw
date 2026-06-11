/*
  Warnings:

  - You are about to drop the `activity_log` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_peer_grants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_realms` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_skill_overrides` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_token_usage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_token_usage_history` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `api_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `auth_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `certificates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `channel_bridges` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `channel_members` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `channel_messages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `channels` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `credentials` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `delegation_certs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `entra_identities` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `intent_log` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `knowledge_files` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `knowledge_sources` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `model_realm_access` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `model_registry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `org_skills` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pending_registrations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `policies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `realm_router_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `realm_skills` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `realm_token_usage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `realms` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_grants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_invitations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_realms` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflow_approvals` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflow_runs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflow_steps` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflows` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "agent_peer_grants" DROP CONSTRAINT "agent_peer_grants_source_did_fkey";

-- DropForeignKey
ALTER TABLE "agent_peer_grants" DROP CONSTRAINT "agent_peer_grants_target_did_fkey";

-- DropForeignKey
ALTER TABLE "agent_realms" DROP CONSTRAINT "agent_realms_agent_did_fkey";

-- DropForeignKey
ALTER TABLE "agent_realms" DROP CONSTRAINT "agent_realms_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_skill_overrides" DROP CONSTRAINT "agent_skill_overrides_agent_did_fkey";

-- DropForeignKey
ALTER TABLE "agent_skill_overrides" DROP CONSTRAINT "agent_skill_overrides_realm_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_token_usage" DROP CONSTRAINT "agent_token_usage_agent_did_fkey";

-- DropForeignKey
ALTER TABLE "agent_token_usage_history" DROP CONSTRAINT "agent_token_usage_history_agent_did_fkey";

-- DropForeignKey
ALTER TABLE "channel_bridges" DROP CONSTRAINT "channel_bridges_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "channel_members" DROP CONSTRAINT "channel_members_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "channel_messages" DROP CONSTRAINT "channel_messages_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "channel_messages" DROP CONSTRAINT "channel_messages_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "channels" DROP CONSTRAINT "channels_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "credentials" DROP CONSTRAINT "credentials_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "delegation_certs" DROP CONSTRAINT "delegation_certs_grant_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_files" DROP CONSTRAINT "knowledge_files_source_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_sources" DROP CONSTRAINT "knowledge_sources_agent_did_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_sources" DROP CONSTRAINT "knowledge_sources_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "model_realm_access" DROP CONSTRAINT "model_realm_access_model_id_fkey";

-- DropForeignKey
ALTER TABLE "model_realm_access" DROP CONSTRAINT "model_realm_access_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "policies" DROP CONSTRAINT "policies_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "realm_router_keys" DROP CONSTRAINT "realm_router_keys_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "realm_skills" DROP CONSTRAINT "realm_skills_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "realm_token_usage" DROP CONSTRAINT "realm_token_usage_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "user_grants" DROP CONSTRAINT "user_grants_user_did_fkey";

-- DropForeignKey
ALTER TABLE "user_realms" DROP CONSTRAINT "user_realms_realm_id_fkey";

-- DropForeignKey
ALTER TABLE "user_realms" DROP CONSTRAINT "user_realms_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_entra_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_reports_to_fkey";

-- DropForeignKey
ALTER TABLE "workflow_approvals" DROP CONSTRAINT "workflow_approvals_run_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_runs" DROP CONSTRAINT "workflow_runs_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_steps" DROP CONSTRAINT "workflow_steps_run_id_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_realm_id_fkey";

-- DropTable
DROP TABLE "activity_log";

-- DropTable
DROP TABLE "agent_peer_grants";

-- DropTable
DROP TABLE "agent_realms";

-- DropTable
DROP TABLE "agent_skill_overrides";

-- DropTable
DROP TABLE "agent_token_usage";

-- DropTable
DROP TABLE "agent_token_usage_history";

-- DropTable
DROP TABLE "agents";

-- DropTable
DROP TABLE "api_keys";

-- DropTable
DROP TABLE "auth_sessions";

-- DropTable
DROP TABLE "certificates";

-- DropTable
DROP TABLE "channel_bridges";

-- DropTable
DROP TABLE "channel_members";

-- DropTable
DROP TABLE "channel_messages";

-- DropTable
DROP TABLE "channels";

-- DropTable
DROP TABLE "credentials";

-- DropTable
DROP TABLE "delegation_certs";

-- DropTable
DROP TABLE "entra_identities";

-- DropTable
DROP TABLE "intent_log";

-- DropTable
DROP TABLE "knowledge_files";

-- DropTable
DROP TABLE "knowledge_sources";

-- DropTable
DROP TABLE "model_realm_access";

-- DropTable
DROP TABLE "model_registry";

-- DropTable
DROP TABLE "org_skills";

-- DropTable
DROP TABLE "pending_registrations";

-- DropTable
DROP TABLE "policies";

-- DropTable
DROP TABLE "realm_router_keys";

-- DropTable
DROP TABLE "realm_skills";

-- DropTable
DROP TABLE "realm_token_usage";

-- DropTable
DROP TABLE "realms";

-- DropTable
DROP TABLE "settings";

-- DropTable
DROP TABLE "user_grants";

-- DropTable
DROP TABLE "user_invitations";

-- DropTable
DROP TABLE "user_realms";

-- DropTable
DROP TABLE "users";

-- DropTable
DROP TABLE "workflow_approvals";

-- DropTable
DROP TABLE "workflow_runs";

-- DropTable
DROP TABLE "workflow_steps";

-- DropTable
DROP TABLE "workflows";

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EntraIdentity" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "mail" TEXT,
    "userPrincipalName" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntraIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "did" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicKey" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certificateData" TEXT,
    "llmConfig" JSONB,
    "tokenBudgetDaily" INTEGER,
    "tokenBudgetMonthly" INTEGER,
    "dailyPriceSpent" DOUBLE PRECISION DEFAULT 0,
    "litellmVirtualKey" TEXT,
    "litellmAllowedModels" JSONB NOT NULL DEFAULT '[]',
    "litellmDailyBudget" DOUBLE PRECISION,
    "litellmKeyUpdatedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locationLat" DOUBLE PRECISION,
    "locationLon" DOUBLE PRECISION,
    "locationLabel" TEXT,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("did")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "certificateData" TEXT NOT NULL DEFAULT '',
    "status" INTEGER NOT NULL DEFAULT -1,
    "agentDid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "registration" TEXT,
    "connection" TEXT,
    "register" INTEGER NOT NULL DEFAULT 1,
    "data" TEXT NOT NULL DEFAULT '',
    "status" INTEGER NOT NULL DEFAULT -1,
    "metadata" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL,
    "event" TEXT NOT NULL,
    "agentDid" TEXT,
    "agentName" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedCapabilities" JSONB NOT NULL DEFAULT '[]',
    "assignedCapabilities" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "did" TEXT,
    "publicKey" TEXT,
    "name" TEXT,
    "email" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'member',
    "reportsTo" TEXT,
    "description" TEXT,
    "entraId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locationLat" DOUBLE PRECISION,
    "locationLon" DOUBLE PRECISION,
    "locationLabel" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGrant" (
    "id" TEXT NOT NULL,
    "userDid" TEXT NOT NULL,
    "agentDid" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "grantedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationCert" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "userDid" TEXT NOT NULL,
    "agentDid" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "certificate" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegationCert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPeerGrant" (
    "id" TEXT NOT NULL,
    "sourceDid" TEXT NOT NULL,
    "targetDid" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "skillDescription" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "certificate" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPeerGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTokenUsage" (
    "agentDid" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTokenUsage_pkey" PRIMARY KEY ("agentDid")
);

-- CreateTable
CREATE TABLE "AgentTokenUsageHistory" (
    "agentDid" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTokenUsageHistory_pkey" PRIMARY KEY ("agentDid","bucket","granularity")
);

-- CreateTable
CREATE TABLE "Realm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "llmConfig" JSONB,
    "defaultCapabilities" JSONB NOT NULL DEFAULT '[]',
    "tokenBudgetDaily" INTEGER,
    "tokenBudgetMonthly" INTEGER,
    "allowedCapabilities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Realm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealmTokenUsage" (
    "realmId" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealmTokenUsage_pkey" PRIMARY KEY ("realmId")
);

-- CreateTable
CREATE TABLE "AgentRealm" (
    "agentDid" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRealm_pkey" PRIMARY KEY ("agentDid","realmId")
);

-- CreateTable
CREATE TABLE "UserRealm" (
    "userId" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isRealmAdmin" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRealm_pkey" PRIMARY KEY ("userId","realmId")
);

-- CreateTable
CREATE TABLE "OrgSkill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "icon" TEXT,
    "content" TEXT,
    "configSchema" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealmSkill" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealmSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkillOverride" (
    "agentDid" TEXT NOT NULL,
    "realmSkillId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AgentSkillOverride_pkey" PRIMARY KEY ("agentDid","realmSkillId")
);

-- CreateTable
CREATE TABLE "ModelRegistry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyEnc" TEXT,
    "litellmModelName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRealmAccess" (
    "modelId" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelRealmAccess_pkey" PRIMARY KEY ("modelId","realmId")
);

-- CreateTable
CREATE TABLE "RealmRouterKey" (
    "realmId" TEXT NOT NULL,
    "litellmVirtualKey" TEXT,
    "allowedModelIds" JSONB NOT NULL DEFAULT '[]',
    "monthlyBudgetUsd" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealmRouterKey_pkey" PRIMARY KEY ("realmId")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "agentDid" TEXT,
    "realmId" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "resourceLimits" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "realmId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduleCron" TEXT,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleLastRun" TIMESTAMP(3),
    "scheduleNextRun" TIMESTAMP(3),

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "results" JSONB,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "agentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowApproval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "nodeMessage" TEXT,
    "stepInput" TEXT,
    "assignedUserId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'approval',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentLog" (
    "intentId" TEXT NOT NULL,
    "agentDid" TEXT,
    "action" TEXT NOT NULL,
    "params" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "output" JSONB,
    "error" TEXT,
    "signature" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntentLog_pkey" PRIMARY KEY ("intentId")
);

-- CreateTable
CREATE TABLE "UserInvitation" (
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "agentDid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "docCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFile" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "content" BYTEA,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "realmId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT,
    "creatorDid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "memberDid" TEXT NOT NULL,
    "memberType" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedBy" TEXT,

    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "threadId" TEXT,
    "authorDid" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reactions" JSONB NOT NULL DEFAULT '{}',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelBridge" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalService" TEXT NOT NULL,
    "externalChannelId" TEXT NOT NULL,
    "externalChannelName" TEXT NOT NULL,
    "externalWorkspaceId" TEXT NOT NULL,
    "syncDirection" TEXT NOT NULL DEFAULT 'bidirectional',
    "isSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "configJson" JSONB NOT NULL,

    CONSTRAINT "ChannelBridge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "allowedRoutes" JSONB NOT NULL DEFAULT '[]',
    "realmId" TEXT,
    "isRealmAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_registration_key" ON "Certificate"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_connection_key" ON "Certificate"("connection");

-- CreateIndex
CREATE UNIQUE INDEX "User_did_key" ON "User"("did");

-- CreateIndex
CREATE INDEX "User_did_idx" ON "User"("did");

-- CreateIndex
CREATE INDEX "User_entraId_idx" ON "User"("entraId");

-- CreateIndex
CREATE INDEX "AgentPeerGrant_sourceDid_idx" ON "AgentPeerGrant"("sourceDid");

-- CreateIndex
CREATE INDEX "AgentPeerGrant_targetDid_idx" ON "AgentPeerGrant"("targetDid");

-- CreateIndex
CREATE INDEX "AgentTokenUsageHistory_agentDid_granularity_bucket_idx" ON "AgentTokenUsageHistory"("agentDid", "granularity", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "Realm_slug_key" ON "Realm"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSkill_name_key" ON "OrgSkill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RealmSkill_realmId_name_key" ON "RealmSkill"("realmId", "name");

-- CreateIndex
CREATE INDEX "ModelRegistry_status_idx" ON "ModelRegistry"("status");

-- CreateIndex
CREATE INDEX "ModelRealmAccess_realmId_idx" ON "ModelRealmAccess"("realmId");

-- CreateIndex
CREATE INDEX "Policy_agentDid_idx" ON "Policy"("agentDid");

-- CreateIndex
CREATE INDEX "Policy_realmId_idx" ON "Policy"("realmId");

-- CreateIndex
CREATE INDEX "Workflow_createdBy_createdAt_idx" ON "Workflow"("createdBy", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Workflow_realmId_idx" ON "Workflow"("realmId");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_startedAt_idx" ON "WorkflowRun"("workflowId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "WorkflowStep_runId_stepId_idx" ON "WorkflowStep"("runId", "stepId");

-- CreateIndex
CREATE INDEX "WorkflowApproval_assignedUserId_status_idx" ON "WorkflowApproval"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "WorkflowApproval_runId_idx" ON "WorkflowApproval"("runId");

-- CreateIndex
CREATE INDEX "IntentLog_agentDid_sentAt_idx" ON "IntentLog"("agentDid", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "IntentLog_status_sentAt_idx" ON "IntentLog"("status", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "UserInvitation_email_idx" ON "UserInvitation"("email");

-- CreateIndex
CREATE INDEX "UserInvitation_expiresAt_idx" ON "UserInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "KnowledgeSource_realmId_idx" ON "KnowledgeSource"("realmId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_agentDid_idx" ON "KnowledgeSource"("agentDid");

-- CreateIndex
CREATE INDEX "KnowledgeFile_sourceId_idx" ON "KnowledgeFile"("sourceId");

-- CreateIndex
CREATE INDEX "Channel_realmId_idx" ON "Channel"("realmId");

-- CreateIndex
CREATE INDEX "Channel_slug_idx" ON "Channel"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_realmId_slug_key" ON "Channel"("realmId", "slug");

-- CreateIndex
CREATE INDEX "ChannelMember_channelId_idx" ON "ChannelMember"("channelId");

-- CreateIndex
CREATE INDEX "ChannelMember_memberDid_idx" ON "ChannelMember"("memberDid");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMember_channelId_memberDid_key" ON "ChannelMember"("channelId", "memberDid");

-- CreateIndex
CREATE INDEX "ChannelMessage_channelId_createdAt_idx" ON "ChannelMessage"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChannelMessage_threadId_idx" ON "ChannelMessage"("threadId");

-- CreateIndex
CREATE INDEX "ChannelMessage_authorDid_idx" ON "ChannelMessage"("authorDid");

-- CreateIndex
CREATE INDEX "ChannelBridge_channelId_idx" ON "ChannelBridge"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelBridge_channelId_externalService_externalChannelId_key" ON "ChannelBridge"("channelId", "externalService", "externalChannelId");

-- CreateIndex
CREATE INDEX "Credential_realmId_idx" ON "Credential"("realmId");

-- CreateIndex
CREATE INDEX "Credential_service_idx" ON "Credential"("service");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_realmId_service_name_key" ON "Credential"("realmId", "service", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_realmId_idx" ON "ApiKey"("realmId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_reportsTo_fkey" FOREIGN KEY ("reportsTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_entraId_fkey" FOREIGN KEY ("entraId") REFERENCES "EntraIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGrant" ADD CONSTRAINT "UserGrant_userDid_fkey" FOREIGN KEY ("userDid") REFERENCES "User"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationCert" ADD CONSTRAINT "DelegationCert_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "UserGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPeerGrant" ADD CONSTRAINT "AgentPeerGrant_sourceDid_fkey" FOREIGN KEY ("sourceDid") REFERENCES "Agent"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPeerGrant" ADD CONSTRAINT "AgentPeerGrant_targetDid_fkey" FOREIGN KEY ("targetDid") REFERENCES "Agent"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTokenUsage" ADD CONSTRAINT "AgentTokenUsage_agentDid_fkey" FOREIGN KEY ("agentDid") REFERENCES "Agent"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTokenUsageHistory" ADD CONSTRAINT "AgentTokenUsageHistory_agentDid_fkey" FOREIGN KEY ("agentDid") REFERENCES "Agent"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmTokenUsage" ADD CONSTRAINT "RealmTokenUsage_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRealm" ADD CONSTRAINT "AgentRealm_agentDid_fkey" FOREIGN KEY ("agentDid") REFERENCES "Agent"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRealm" ADD CONSTRAINT "AgentRealm_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRealm" ADD CONSTRAINT "UserRealm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRealm" ADD CONSTRAINT "UserRealm_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmSkill" ADD CONSTRAINT "RealmSkill_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkillOverride" ADD CONSTRAINT "AgentSkillOverride_agentDid_fkey" FOREIGN KEY ("agentDid") REFERENCES "Agent"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkillOverride" ADD CONSTRAINT "AgentSkillOverride_realmSkillId_fkey" FOREIGN KEY ("realmSkillId") REFERENCES "RealmSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRealmAccess" ADD CONSTRAINT "ModelRealmAccess_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRealmAccess" ADD CONSTRAINT "ModelRealmAccess_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmRouterKey" ADD CONSTRAINT "RealmRouterKey_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_agentDid_fkey" FOREIGN KEY ("agentDid") REFERENCES "Agent"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFile" ADD CONSTRAINT "KnowledgeFile_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChannelMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelBridge" ADD CONSTRAINT "ChannelBridge_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "Realm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
