-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "entra_identities" (
    "id" TEXT NOT NULL,
    "display_name" TEXT,
    "mail" TEXT,
    "user_principal_name" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entra_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "did" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "public_key" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "certificate_data" TEXT,
    "llm_config" JSONB,
    "token_budget_daily" INTEGER,
    "token_budget_monthly" INTEGER,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("did")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "session_key" TEXT NOT NULL,
    "certificate_data" TEXT NOT NULL DEFAULT '',
    "status" INTEGER NOT NULL DEFAULT -1,
    "agent_did" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "registration" TEXT,
    "connection" TEXT,
    "register" INTEGER NOT NULL DEFAULT 1,
    "data" TEXT NOT NULL DEFAULT '',
    "status" INTEGER NOT NULL DEFAULT -1,
    "metadata" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" SERIAL NOT NULL,
    "event" TEXT NOT NULL,
    "agent_did" TEXT,
    "agent_name" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_registrations" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_capabilities" JSONB NOT NULL DEFAULT '[]',
    "assigned_capabilities" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "did" TEXT,
    "public_key" TEXT,
    "name" TEXT,
    "email" TEXT,
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'member',
    "reports_to" TEXT,
    "description" TEXT,
    "entra_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_grants" (
    "id" TEXT NOT NULL,
    "user_did" TEXT NOT NULL,
    "agent_did" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "granted_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegation_certs" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "user_did" TEXT NOT NULL,
    "agent_did" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "certificate" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegation_certs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_peer_grants" (
    "id" TEXT NOT NULL,
    "source_did" TEXT NOT NULL,
    "target_did" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "skill_description" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "certificate" TEXT NOT NULL DEFAULT '',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_peer_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_token_usage" (
    "agent_did" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_token_usage_pkey" PRIMARY KEY ("agent_did")
);

-- CreateTable
CREATE TABLE "agent_token_usage_history" (
    "agent_did" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_token_usage_history_pkey" PRIMARY KEY ("agent_did","bucket","granularity")
);

-- CreateTable
CREATE TABLE "realms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "llm_config" JSONB,
    "default_capabilities" JSONB NOT NULL DEFAULT '[]',
    "token_budget_daily" INTEGER,
    "token_budget_monthly" INTEGER,
    "allowed_capabilities" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realm_token_usage" (
    "realm_id" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realm_token_usage_pkey" PRIMARY KEY ("realm_id")
);

-- CreateTable
CREATE TABLE "agent_realms" (
    "agent_did" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_realms_pkey" PRIMARY KEY ("agent_did","realm_id")
);

-- CreateTable
CREATE TABLE "user_realms" (
    "user_id" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_realm_admin" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_realms_pkey" PRIMARY KEY ("user_id","realm_id")
);

-- CreateTable
CREATE TABLE "org_skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "icon" TEXT,
    "content" TEXT,
    "config_schema" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realm_skills" (
    "id" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realm_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_skill_overrides" (
    "agent_did" TEXT NOT NULL,
    "realm_skill_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "agent_skill_overrides_pkey" PRIMARY KEY ("agent_did","realm_skill_id")
);

-- CreateTable
CREATE TABLE "model_registry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key_enc" TEXT,
    "litellm_model_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_realm_access" (
    "model_id" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_realm_access_pkey" PRIMARY KEY ("model_id","realm_id")
);

-- CreateTable
CREATE TABLE "realm_router_keys" (
    "realm_id" TEXT NOT NULL,
    "litellm_virtual_key" TEXT,
    "allowed_model_ids" JSONB NOT NULL DEFAULT '[]',
    "monthly_budget_usd" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realm_router_keys_pkey" PRIMARY KEY ("realm_id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "agent_did" TEXT,
    "realm_id" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "resource_limits" JSONB,
    "expires_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "realm_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schedule_cron" TEXT,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_last_run" TIMESTAMP(3),
    "schedule_next_run" TIMESTAMP(3),

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "results" JSONB,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "output" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_approvals" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "node_message" TEXT,
    "step_input" TEXT,
    "assigned_user_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'approval',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intent_log" (
    "intent_id" TEXT NOT NULL,
    "agent_did" TEXT,
    "action" TEXT NOT NULL,
    "params" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "output" JSONB,
    "error" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "intent_log_pkey" PRIMARY KEY ("intent_id")
);

-- CreateTable
CREATE TABLE "user_invitations" (
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "agent_did" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "doc_count" INTEGER NOT NULL DEFAULT 0,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "last_synced_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_files" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "content" BYTEA,
    "file_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "realm_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT,
    "creator_did" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "member_did" TEXT NOT NULL,
    "member_type" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by" TEXT,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "author_did" TEXT NOT NULL,
    "author_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reactions" JSONB NOT NULL DEFAULT '{}',
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_bridges" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_service" TEXT NOT NULL,
    "external_channel_id" TEXT NOT NULL,
    "external_channel_name" TEXT NOT NULL,
    "external_workspace_id" TEXT NOT NULL,
    "sync_direction" TEXT NOT NULL DEFAULT 'bidirectional',
    "is_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "config_json" JSONB NOT NULL,

    CONSTRAINT "channel_bridges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "allowed_routes" JSONB NOT NULL DEFAULT '[]',
    "realm_id" TEXT,
    "is_realm_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_registration_key" ON "certificates"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_connection_key" ON "certificates"("connection");

-- CreateIndex
CREATE UNIQUE INDEX "users_did_key" ON "users"("did");

-- CreateIndex
CREATE INDEX "users_did_idx" ON "users"("did");

-- CreateIndex
CREATE INDEX "users_entra_id_idx" ON "users"("entra_id");

-- CreateIndex
CREATE INDEX "agent_peer_grants_source_did_idx" ON "agent_peer_grants"("source_did");

-- CreateIndex
CREATE INDEX "agent_peer_grants_target_did_idx" ON "agent_peer_grants"("target_did");

-- CreateIndex
CREATE INDEX "agent_token_usage_history_agent_did_granularity_bucket_idx" ON "agent_token_usage_history"("agent_did", "granularity", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "realms_slug_key" ON "realms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "org_skills_name_key" ON "org_skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "realm_skills_realm_id_name_key" ON "realm_skills"("realm_id", "name");

-- CreateIndex
CREATE INDEX "model_registry_status_idx" ON "model_registry"("status");

-- CreateIndex
CREATE INDEX "model_realm_access_realm_id_idx" ON "model_realm_access"("realm_id");

-- CreateIndex
CREATE INDEX "policies_agent_did_idx" ON "policies"("agent_did");

-- CreateIndex
CREATE INDEX "policies_realm_id_idx" ON "policies"("realm_id");

-- CreateIndex
CREATE INDEX "workflows_created_by_created_at_idx" ON "workflows"("created_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workflows_realm_id_idx" ON "workflows"("realm_id");

-- CreateIndex
CREATE INDEX "workflow_runs_workflow_id_started_at_idx" ON "workflow_runs"("workflow_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_steps_run_id_step_id_idx" ON "workflow_steps"("run_id", "step_id");

-- CreateIndex
CREATE INDEX "workflow_approvals_assigned_user_id_status_idx" ON "workflow_approvals"("assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "workflow_approvals_run_id_idx" ON "workflow_approvals"("run_id");

-- CreateIndex
CREATE INDEX "intent_log_agent_did_sent_at_idx" ON "intent_log"("agent_did", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "intent_log_status_sent_at_idx" ON "intent_log"("status", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "user_invitations_email_idx" ON "user_invitations"("email");

-- CreateIndex
CREATE INDEX "user_invitations_expires_at_idx" ON "user_invitations"("expires_at");

-- CreateIndex
CREATE INDEX "knowledge_sources_realm_id_idx" ON "knowledge_sources"("realm_id");

-- CreateIndex
CREATE INDEX "knowledge_sources_agent_did_idx" ON "knowledge_sources"("agent_did");

-- CreateIndex
CREATE INDEX "knowledge_files_source_id_idx" ON "knowledge_files"("source_id");

-- CreateIndex
CREATE INDEX "channels_realm_id_idx" ON "channels"("realm_id");

-- CreateIndex
CREATE INDEX "channels_slug_idx" ON "channels"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "channels_realm_id_slug_key" ON "channels"("realm_id", "slug");

-- CreateIndex
CREATE INDEX "channel_members_channel_id_idx" ON "channel_members"("channel_id");

-- CreateIndex
CREATE INDEX "channel_members_member_did_idx" ON "channel_members"("member_did");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channel_id_member_did_key" ON "channel_members"("channel_id", "member_did");

-- CreateIndex
CREATE INDEX "channel_messages_channel_id_created_at_idx" ON "channel_messages"("channel_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "channel_messages_thread_id_idx" ON "channel_messages"("thread_id");

-- CreateIndex
CREATE INDEX "channel_messages_author_did_idx" ON "channel_messages"("author_did");

-- CreateIndex
CREATE INDEX "channel_bridges_channel_id_idx" ON "channel_bridges"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_bridges_channel_id_external_service_external_channe_key" ON "channel_bridges"("channel_id", "external_service", "external_channel_id");

-- CreateIndex
CREATE INDEX "credentials_realm_id_idx" ON "credentials"("realm_id");

-- CreateIndex
CREATE INDEX "credentials_service_idx" ON "credentials"("service");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_realm_id_service_name_key" ON "credentials"("realm_id", "service", "name");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_realm_id_idx" ON "api_keys"("realm_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_reports_to_fkey" FOREIGN KEY ("reports_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_entra_id_fkey" FOREIGN KEY ("entra_id") REFERENCES "entra_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_grants" ADD CONSTRAINT "user_grants_user_did_fkey" FOREIGN KEY ("user_did") REFERENCES "users"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_certs" ADD CONSTRAINT "delegation_certs_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "user_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_peer_grants" ADD CONSTRAINT "agent_peer_grants_source_did_fkey" FOREIGN KEY ("source_did") REFERENCES "agents"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_peer_grants" ADD CONSTRAINT "agent_peer_grants_target_did_fkey" FOREIGN KEY ("target_did") REFERENCES "agents"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_token_usage" ADD CONSTRAINT "agent_token_usage_agent_did_fkey" FOREIGN KEY ("agent_did") REFERENCES "agents"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_token_usage_history" ADD CONSTRAINT "agent_token_usage_history_agent_did_fkey" FOREIGN KEY ("agent_did") REFERENCES "agents"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "realm_token_usage" ADD CONSTRAINT "realm_token_usage_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_realms" ADD CONSTRAINT "agent_realms_agent_did_fkey" FOREIGN KEY ("agent_did") REFERENCES "agents"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_realms" ADD CONSTRAINT "agent_realms_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_realms" ADD CONSTRAINT "user_realms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_realms" ADD CONSTRAINT "user_realms_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "realm_skills" ADD CONSTRAINT "realm_skills_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skill_overrides" ADD CONSTRAINT "agent_skill_overrides_agent_did_fkey" FOREIGN KEY ("agent_did") REFERENCES "agents"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skill_overrides" ADD CONSTRAINT "agent_skill_overrides_realm_skill_id_fkey" FOREIGN KEY ("realm_skill_id") REFERENCES "realm_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_realm_access" ADD CONSTRAINT "model_realm_access_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "model_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_realm_access" ADD CONSTRAINT "model_realm_access_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "realm_router_keys" ADD CONSTRAINT "realm_router_keys_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_agent_did_fkey" FOREIGN KEY ("agent_did") REFERENCES "agents"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_files" ADD CONSTRAINT "knowledge_files_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "channel_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_bridges" ADD CONSTRAINT "channel_bridges_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "realms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
