#!/usr/bin/env node
/**
 * Migration script: replaces lib/db.ts imports + function calls with new DAO layer.
 * Run from packages/control-plane/: node scripts/migrate-to-dao.mjs
 */

import fs from 'fs'
import path from 'path'
import { globSync } from 'fs'

const BASE = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

// ─── Mapping: old function/symbol → new DAO expression (with await) ──────────
// Format: 'oldName': 'awaitedNewCall'
// For function calls: just the replacement prefix (args unchanged unless noted)
const FUNC_MAP = {
  // Agent
  'upsertAgent':             'await AgentDAO.upsert',
  'getAgent':                'await AgentDAO.findByDid',
  'getAgentByName':          'await AgentDAO.findByName',
  'getAllAgents':             'await AgentDAO.findAll()',  // no args
  'queryAgents':             'await AgentDAO.query',
  'updateAgentLastSeen':     'await AgentDAO.updateLastSeen',
  'setAgentLlmConfig':       'await AgentDAO.setLlmConfig',
  'updateAgentBudget':       'await AgentDAO.updateBudget',
  'deleteAgent':             'await AgentDAO.delete',
  'getAgentRealms':          'await AgentDAO.getRealms',
  'addAgentToRealm':         'await AgentDAO.addToRealm',
  'removeAgentFromRealm':    'await AgentDAO.removeFromRealm',
  'upsertTokenUsage':        'await AgentDAO.upsertTokenUsage',
  'getTotalFleetTokenUsage': 'await AgentDAO.getTotalFleetTokenUsage()',
  'getAgentTokenUsage':      'await AgentDAO.getTokenUsage',
  'getAllTokenUsage':         'await AgentDAO.getAllTokenUsage()',
  'addAgentTokenUsageHistory': 'await AgentDAO.addTokenUsageHistory',
  'getAgentTokenUsageHistory': 'await AgentDAO.getTokenUsageHistory',
  'getAgentSkillOverrides':  'await SkillOverrideDAO.findByAgent',
  'setAgentSkillOverride':   'await SkillOverrideDAO.set',
  'getAgentEffectiveSkills': 'await SkillOverrideDAO.getEffectiveSkills',

  // Realm
  'getAllRealms':          'await RealmDAO.findAll()',
  'getRealmById':         'await RealmDAO.findById',
  'getRealmBySlug':       'await RealmDAO.findBySlug',
  'getDefaultRealm':      'await RealmDAO.findDefault()',
  'createRealm':          'await RealmDAO.create',
  'updateRealm':          'await RealmDAO.update',
  'deleteRealm':          'await RealmDAO.delete',
  'setDefaultRealm':      'await RealmDAO.setDefault',
  'getRealmAgents':       'await RealmDAO.getAgents',
  'getRealmUsers':        'await RealmDAO.getUsers',
  'getUserRealms':        'await RealmDAO.getUserRealms',
  'isUserInRealm':        'await RealmDAO.isUserInRealm',
  'isUserRealmAdmin':     'await RealmDAO.isUserRealmAdmin',
  'setUserRealmAdmin':    'await RealmDAO.setUserRealmAdmin',
  'addUserToRealm':       'await RealmDAO.addUserToRealm',
  'removeUserFromRealm':  'await RealmDAO.removeUserFromRealm',
  'enrollInDefaultRealm': 'await RealmDAO.enrollInDefault',
  'getRealmTokenUsage':   'await RealmDAO.getTokenUsage',
  'upsertRealmTokenUsage':'await RealmDAO.upsertTokenUsage',
  'getTotalRealmTokenUsage': 'await RealmDAO.getTokenUsage',
  'getAllRealmTokenUsage': 'await RealmDAO.getAllTokenUsage()',
  'getRealmRouterKey':    'await RealmDAO.getRouterKey',
  'upsertRealmRouterKey': 'await RealmDAO.upsertRouterKey',

  // Auth sessions
  'createAuthSession':        'await AuthSessionDAO.create',
  'getAuthSession':           'await AuthSessionDAO.findById',
  'updateAuthSession':        'await AuthSessionDAO.update',
  'deleteExpiredAuthSessions':'await AuthSessionDAO.deleteExpired',

  // Certificates (from certificate-dao)
  'createCertificate':   'await CertificateDAO.create',
  'getCertificate':      'await CertificateDAO.findById',
  'updateCertificate':   'await CertificateDAO.update',
  'deleteCertificate':   'await CertificateDAO.delete',

  // Pending registrations
  'createPendingRegistration':  'await PendingRegistrationDAO.create',
  'getPendingRegistration':     'await PendingRegistrationDAO.findById',
  'getAllPendingRegistrations':  'await PendingRegistrationDAO.findAll()',
  'updatePendingRegistration':  'await PendingRegistrationDAO.updateStatus',
  'deletePendingRegistration':  'await PendingRegistrationDAO.delete',

  // Intents & Activity
  'logIntent':          'await IntentDAO.log',
  'updateIntentResult': 'await IntentDAO.updateResult',
  'getIntentLog':       'await IntentDAO.findAll',
  'logActivity':        'await ActivityLogDAO.log',
  'getActivityLog':     'await ActivityLogDAO.findAll',
  'getActivityLogByAgent': 'await ActivityLogDAO.findByAgent',
  'getActivityLogByEvent': 'await ActivityLogDAO.findByEvent',

  // Workflows
  'saveWorkflow':               'await WorkflowDAO.create',
  'getWorkflow':                'await WorkflowDAO.findById',
  'listWorkflows':              'await WorkflowDAO.list',
  'updateWorkflow':             'await WorkflowDAO.update',
  'deleteWorkflow':             'await WorkflowDAO.delete',
  'setWorkflowSchedule':        'await WorkflowDAO.setSchedule',
  'updateWorkflowScheduleRun':  'await WorkflowDAO.updateScheduleRun',
  'getDueScheduledWorkflows':   'await WorkflowDAO.getDueScheduled()',
  'startWorkflowRun':           'await WorkflowDAO.startRun',
  'getWorkflowRun':             'await WorkflowDAO.findRun',
  'updateWorkflowRunStatus':    'await WorkflowDAO.updateRunStatus',
  'queryWorkflowRuns':          'await WorkflowDAO.queryRuns',
  'recordWorkflowStep':         'await WorkflowDAO.recordStep',
  'updateWorkflowStep':         'await WorkflowDAO.updateStep',
  'getWorkflowRunSteps':        'await WorkflowDAO.getRunSteps',
  'getWorkflowRunHistory':      'await WorkflowDAO.getRunHistory',
  'createWorkflowApproval':     'await WorkflowDAO.createApproval',
  'getPendingApprovalsForUser': 'await WorkflowDAO.getPendingApprovalsForUser',
  'getAllApprovalsForUser':      'await WorkflowDAO.getAllApprovalsForUser',
  'getApprovalsForRun':         'await WorkflowDAO.getApprovalsForRun',
  'resolveWorkflowApproval':    'await WorkflowDAO.resolveApproval',
  'dismissWorkflowNotification':'await WorkflowDAO.dismissNotification',

  // Skills
  'getOrgSkills':       'await OrgSkillDAO.findAll()',
  'getOrgSkillById':    'await OrgSkillDAO.findById',
  'getOrgSkillByName':  'await OrgSkillDAO.findByName',
  'createOrgSkill':     'await OrgSkillDAO.create',
  'updateOrgSkill':     'await OrgSkillDAO.update',
  'deleteOrgSkill':     'await OrgSkillDAO.delete',
  'getRealmSkills':     'await RealmSkillDAO.findAll',
  'getRealmSkillById':  'await RealmSkillDAO.findById',
  'createRealmSkill':   'await RealmSkillDAO.create',
  'updateRealmSkill':   'await RealmSkillDAO.update',
  'deleteRealmSkill':   'await RealmSkillDAO.delete',
  'getAllSkillsWithRealms': 'await RealmSkillDAO.findAllWithRealms()',

  // Models
  'createModelRegistryEntry': 'await ModelDAO.create',
  'getModelRegistryEntry':    'await ModelDAO.findById',
  'getAllModelRegistryEntries': 'await ModelDAO.findAll()',
  'getModelsByRealm':         'await ModelDAO.findByRealm',
  'updateModelRegistryEntry': 'await ModelDAO.update',
  'deleteModelRegistryEntry': 'await ModelDAO.delete',
  'getModelRealmAccess':      'await ModelDAO.getRealmAccess',
  'grantModelRealmAccess':    'await ModelDAO.grantRealmAccess',
  'revokeModelRealmAccess':   'await ModelDAO.revokeRealmAccess',

  // Policies
  'createPolicy':         'await PolicyDAO.create',
  'listPolicies':         'await PolicyDAO.list',
  'getPolicy':            'await PolicyDAO.findById',
  'deletePolicy':         'await PolicyDAO.delete',
  'countPoliciesByAgent': 'await PolicyDAO.countByAgent()',

  // Knowledge
  'createKnowledgeSource':     'await KnowledgeDAO.createSource',
  'getKnowledgeSource':        'await KnowledgeDAO.findSource',
  'listKnowledgeSources':      'await KnowledgeDAO.listSources',
  'updateKnowledgeSourceStatus': 'await KnowledgeDAO.updateSourceStatus',
  'deleteKnowledgeSource':     'await KnowledgeDAO.deleteSource',
  'listKnowledgeFiles':        'await KnowledgeDAO.listFiles',
  'getKnowledgeFileContent':   'await KnowledgeDAO.findFile',
  'deleteKnowledgeFile':       'await KnowledgeDAO.deleteFile',
  'getKnowledgeFileAttachments': 'await KnowledgeDAO.getFilePathsForSource',

  // Credentials
  'saveCredential':          'await CredentialDAO.save',
  'getCredentialById':       'await CredentialDAO.findById',
  'getCredentialByKey':      'await CredentialDAO.findByKey',
  'listCredentials':         'await CredentialDAO.list',
  'listCredentialsByService':'await CredentialDAO.listByService',
  'deleteCredential':        'await CredentialDAO.delete',
  'deleteCredentialByKey':   'await CredentialDAO.deleteByKey',

  // Settings
  'getSetting': 'await SettingsDAO.get',
  'setSetting': 'await SettingsDAO.set',

  // Old DAO classes (from lib/user-dao etc.)
  'UserDao.getById':            'await UserDAO.findById',
  'UserDao.getByDid':           'await UserDAO.findByDid',
  'UserDao.create':             'await UserDAO.create',
  'UserDao.createFromEntra':    'await UserDAO.createFromEntra',
  'UserDao.refreshEntraIdentity': 'await UserDAO.refreshEntraIdentity',
  'UserDao.linkEntraIdentity':  'await UserDAO.linkEntraIdentity',
  'UserDao.update':             'await UserDAO.update',
  'GrantDao.listByUser':        'await GrantDAO.listByUser',
  'GrantDao.create':            'await GrantDAO.create',
  'GrantDao.delete':            'await GrantDAO.delete',
  'DelegationDao.create':       'await DelegationCertDAO.create',
  'DelegationDao.listByAgent':  'await DelegationCertDAO.listByAgent',
  'DelegationDao.listByUser':   'await DelegationCertDAO.listByUser',
  'ChannelDao.create':          'await ChannelDAO.create',
  'ChannelDao.getById':         'await ChannelDAO.findById',
  'ChannelDao.getBySlug':       'await ChannelDAO.findBySlug',
  'ChannelDao.listByRealm':     'await ChannelDAO.listByRealm',
  'ChannelDao.listGlobal':      'await ChannelDAO.listGlobal()',
  'ChannelDao.listByRealmWithGlobal': 'await ChannelDAO.listByRealmWithGlobal',
  'ChannelDao.update':          'await ChannelDAO.update',
  'ChannelDao.delete':          'await ChannelDAO.delete',
  'ChannelMemberDao.add':       'await ChannelMemberDAO.add',
  'ChannelMemberDao.listByChannel': 'await ChannelMemberDAO.listByChannel',
  'ChannelMemberDao.listByMember': 'await ChannelMemberDAO.listByMember',
  'ChannelMemberDao.findMembership': 'await ChannelMemberDAO.findMembership',
  'ChannelMemberDao.remove':    'await ChannelMemberDAO.remove',
  'ChannelMessageDao.create':   'await ChannelMessageDAO.create',
  'ChannelMessageDao.findById': 'await ChannelMessageDAO.findById',
  'ChannelMessageDao.listByChannel': 'await ChannelMessageDAO.listByChannel',
  'ChannelMessageDao.listThread': 'await ChannelMessageDAO.listThread',
  'ChannelMessageDao.update':   'await ChannelMessageDAO.update',
  'ChannelMessageDao.softDelete': 'await ChannelMessageDAO.softDelete',
  'ChannelMessageDao.addReaction': 'await ChannelMessageDAO.addReaction',
  'ChannelBridgeDao.create':    'await ChannelBridgeDAO.create',
  'ChannelBridgeDao.listByChannel': 'await ChannelBridgeDAO.listByChannel',
  'ChannelBridgeDao.findById':  'await ChannelBridgeDAO.findById',
  'ChannelBridgeDao.update':    'await ChannelBridgeDAO.update',
  'ChannelBridgeDao.delete':    'await ChannelBridgeDAO.delete',
}

// ─── Field renames (snake_case → camelCase) ───────────────────────────────────
// Applied via regex on dot-access patterns
const FIELD_RENAMES = [
  // Agent fields
  [/\.last_seen\b/g,           '.lastSeen'],
  [/\.public_key\b/g,          '.publicKey'],
  [/\.certificate_data\b/g,    '.certificateData'],
  [/\.registered_at\b/g,       '.registeredAt'],
  [/\.token_budget_daily\b/g,  '.tokenBudgetDaily'],
  [/\.token_budget_monthly\b/g,'.tokenBudgetMonthly'],
  [/\.llm_config\b/g,          '.llmConfig'],
  // Realm fields
  [/\.is_default\b/g,          '.isDefault'],
  [/\.default_capabilities\b/g,'.defaultCapabilities'],
  [/\.allowed_capabilities\b/g,'.allowedCapabilities'],
  [/\.created_at\b/g,          '.createdAt'],
  [/\.updated_at\b/g,          '.updatedAt'],
  // User fields
  [/\.is_owner\b/g,            '.isOwner'],
  [/\.is_admin\b/g,            '.isAdmin'],
  [/\.reports_to\b/g,          '.reportsTo'],
  [/\.claimed_at\b/g,          '.claimedAt'],
  [/\.entra_id\b/g,            '.entraId'],
  // Realm router key
  [/\.litellm_virtual_key\b/g, '.litellmVirtualKey'],
  [/\.allowed_model_ids\b/g,   '.allowedModelIds'],
  [/\.monthly_budget_usd\b/g,  '.monthlyBudgetUsd'],
  // Workflow fields
  [/\.realm_id\b/g,            '.realmId'],
  [/\.created_by\b/g,          '.createdBy'],
  [/\.schedule_cron\b/g,       '.scheduleCron'],
  [/\.schedule_enabled\b/g,    '.scheduleEnabled'],
  [/\.schedule_last_run\b/g,   '.scheduleLastRun'],
  [/\.schedule_next_run\b/g,   '.scheduleNextRun'],
  // Workflow run / step
  [/\.workflow_id\b/g,         '.workflowId'],
  [/\.workflow_name\b/g,       '.workflowName'],
  [/\.started_at\b/g,          '.startedAt'],
  [/\.completed_at\b/g,        '.completedAt'],
  [/\.run_id\b/g,              '.runId'],
  [/\.step_id\b/g,             '.stepId'],
  [/\.agent_id\b/g,            '.agentId'],
  // Approval fields
  [/\.node_message\b/g,        '.nodeMessage'],
  [/\.step_input\b/g,          '.stepInput'],
  [/\.assigned_user_id\b/g,    '.assignedUserId'],
  [/\.decided_at\b/g,          '.decidedAt'],
  [/\.decided_by\b/g,          '.decidedBy'],
  // Policy fields
  [/\.agent_did\b/g,           '.agentDid'],
  [/\.resource_limits\b/g,     '.resourceLimits'],
  [/\.expires_at\b/g,          '.expiresAt'],
  // Model fields
  [/\.model_id\b/g,            '.modelId'],
  [/\.base_url\b/g,            '.baseUrl'],
  [/\.api_key_enc\b/g,         '.apiKeyEnc'],
  [/\.litellm_model_name\b/g,  '.litellmModelName'],
  // Skill fields
  [/\.config_schema\b/g,       '.configSchema'],
  [/\.is_required\b/g,         '.isRequired'],
  // Channel fields
  [/\.is_public\b/g,           '.isPublic'],
  [/\.is_archived\b/g,         '.isArchived'],
  [/\.creator_did\b/g,         '.creatorDid'],
  // Channel member
  [/\.channel_id\b/g,          '.channelId'],
  [/\.member_did\b/g,          '.memberDid'],
  [/\.member_type\b/g,         '.memberType'],
  [/\.joined_at\b/g,           '.joinedAt'],
  [/\.invited_by\b/g,          '.invitedBy'],
  // Channel message
  [/\.thread_id\b/g,           '.threadId'],
  [/\.author_did\b/g,          '.authorDid'],
  [/\.author_type\b/g,         '.authorType'],
  [/\.edited_at\b/g,           '.editedAt'],
  [/\.deleted_at\b/g,          '.deletedAt'],
  // Channel bridge
  [/\.external_service\b/g,    '.externalService'],
  [/\.external_channel_id\b/g, '.externalChannelId'],
  [/\.external_channel_name\b/g,'.externalChannelName'],
  [/\.external_workspace_id\b/g,'.externalWorkspaceId'],
  [/\.sync_direction\b/g,      '.syncDirection'],
  [/\.is_sync_enabled\b/g,     '.isSyncEnabled'],
  [/\.config_json\b/g,         '.configJson'],
  // Credential
  [/\.secret_enc\b/g,          '.secretEnc'],
  // API key
  [/\.key_hash\b/g,            '.keyHash'],
  [/\.key_prefix\b/g,          '.keyPrefix'],
  [/\.allowed_routes\b/g,      '.allowedRoutes'],
  [/\.is_realm_admin\b/g,      '.isRealmAdmin'],
  [/\.is_active\b/g,           '.isActive'],
  [/\.last_used_at\b/g,        '.lastUsedAt'],
  // Intent log
  [/\.intent_id\b/g,           '.intentId'],
  [/\.sent_at\b/g,             '.sentAt'],
  // Activity log
  [/\.agent_name\b/g,          '.agentName'],
  // Knowledge
  [/\.source_type\b/g,         '.sourceType'],
  [/\.doc_count\b/g,           '.docCount'],
  [/\.chunk_count\b/g,         '.chunkCount'],
  [/\.last_synced_at\b/g,      '.lastSyncedAt'],
  [/\.source_id\b/g,           '.sourceId'],
  [/\.mime_type\b/g,           '.mimeType'],
  [/\.file_path\b/g,           '.filePath'],
  // Pending registration
  [/\.session_id\b/g,          '.sessionId'],
  [/\.agent_name\b/g,          '.agentName'],  // for pending reg
  [/\.requested_capabilities\b/g, '.requestedCapabilities'],
  [/\.assigned_capabilities\b/g,  '.assignedCapabilities'],
  // AgentRealm
  [/\.is_primary\b/g,          '.isPrimary'],
  [/\.is_realm_admin\b/g,      '.isRealmAdmin'],
  // Entra
  [/\.display_name\b/g,        '.displayName'],
  [/\.user_principal_name\b/g, '.userPrincipalName'],
  [/\.synced_at\b/g,           '.syncedAt'],
  // AgentPeerGrant
  [/\.source_did\b/g,          '.sourceDid'],
  [/\.target_did\b/g,          '.targetDid'],
  [/\.target_name\b/g,         '.targetName'],
  [/\.skill_description\b/g,   '.skillDescription'],
  // AgentTokenUsage
  [/\.prompt_tokens\b/g,       '.promptTokens'],
  [/\.completion_tokens\b/g,   '.completionTokens'],
  // Certificate
  [/\.register\b(?!ed)/g,      '.register'],  // careful - keep 'register' message type
  [/\.started_at\b/g,          '.startedAt'],
  // Auth session
  [/\.session_key\b/g,         '.sessionKey'],
  // User invitation
  [/\.expires_at\b/g,          '.expiresAt'],
]

// ─── Which DAOs to import based on functions used ─────────────────────────────
const DAO_SOURCES = {
  AgentDAO:              ['AgentDAO', 'upsertAgent', 'getAgent', 'getAgentByName', 'getAllAgents', 'queryAgents', 'updateAgentLastSeen', 'setAgentLlmConfig', 'updateAgentBudget', 'deleteAgent', 'getAgentRealms', 'addAgentToRealm', 'removeAgentFromRealm', 'upsertTokenUsage', 'getTotalFleetTokenUsage', 'getAgentTokenUsage', 'getAllTokenUsage', 'addAgentTokenUsageHistory', 'getAgentTokenUsageHistory'],
  RealmDAO:              ['RealmDAO', 'getAllRealms', 'getRealmById', 'getRealmBySlug', 'getDefaultRealm', 'createRealm', 'updateRealm', 'deleteRealm', 'setDefaultRealm', 'getRealmAgents', 'getRealmUsers', 'getUserRealms', 'isUserInRealm', 'isUserRealmAdmin', 'setUserRealmAdmin', 'addUserToRealm', 'removeUserFromRealm', 'enrollInDefaultRealm', 'getRealmTokenUsage', 'upsertRealmTokenUsage', 'getTotalRealmTokenUsage', 'getAllRealmTokenUsage', 'getRealmRouterKey', 'upsertRealmRouterKey'],
  UserDAO:               ['UserDAO', 'UserDao'],
  AuthSessionDAO:        ['AuthSessionDAO', 'createAuthSession', 'getAuthSession', 'updateAuthSession', 'deleteExpiredAuthSessions'],
  CertificateDAO:        ['CertificateDAO', 'createCertificate', 'getCertificate', 'updateCertificate', 'deleteCertificate'],
  PendingRegistrationDAO:['PendingRegistrationDAO', 'createPendingRegistration', 'getPendingRegistration', 'getAllPendingRegistrations', 'updatePendingRegistration', 'deletePendingRegistration'],
  GrantDAO:              ['GrantDAO', 'GrantDao'],
  DelegationCertDAO:     ['DelegationCertDAO', 'DelegationDao'],
  IntentDAO:             ['IntentDAO', 'logIntent', 'updateIntentResult', 'getIntentLog'],
  ActivityLogDAO:        ['ActivityLogDAO', 'logActivity', 'getActivityLog', 'getActivityLogByAgent', 'getActivityLogByEvent'],
  WorkflowDAO:           ['WorkflowDAO', 'saveWorkflow', 'getWorkflow', 'listWorkflows', 'updateWorkflow', 'deleteWorkflow', 'setWorkflowSchedule', 'updateWorkflowScheduleRun', 'getDueScheduledWorkflows', 'startWorkflowRun', 'getWorkflowRun', 'updateWorkflowRunStatus', 'queryWorkflowRuns', 'recordWorkflowStep', 'updateWorkflowStep', 'getWorkflowRunSteps', 'getWorkflowRunHistory', 'createWorkflowApproval', 'getPendingApprovalsForUser', 'getAllApprovalsForUser', 'getApprovalsForRun', 'resolveWorkflowApproval', 'dismissWorkflowNotification'],
  OrgSkillDAO:           ['OrgSkillDAO', 'getOrgSkills', 'getOrgSkillById', 'getOrgSkillByName', 'createOrgSkill', 'updateOrgSkill', 'deleteOrgSkill'],
  RealmSkillDAO:         ['RealmSkillDAO', 'getRealmSkills', 'getRealmSkillById', 'createRealmSkill', 'updateRealmSkill', 'deleteRealmSkill', 'getAllSkillsWithRealms'],
  SkillOverrideDAO:      ['SkillOverrideDAO', 'getAgentSkillOverrides', 'setAgentSkillOverride', 'getAgentEffectiveSkills'],
  ModelDAO:              ['ModelDAO', 'createModelRegistryEntry', 'getModelRegistryEntry', 'getAllModelRegistryEntries', 'getModelsByRealm', 'updateModelRegistryEntry', 'deleteModelRegistryEntry', 'getModelRealmAccess', 'grantModelRealmAccess', 'revokeModelRealmAccess'],
  PolicyDAO:             ['PolicyDAO', 'createPolicy', 'listPolicies', 'getPolicy', 'deletePolicy', 'countPoliciesByAgent'],
  KnowledgeDAO:          ['KnowledgeDAO', 'createKnowledgeSource', 'getKnowledgeSource', 'listKnowledgeSources', 'updateKnowledgeSourceStatus', 'deleteKnowledgeSource', 'createKnowledgeFile', 'listKnowledgeFiles', 'getKnowledgeFileContent', 'deleteKnowledgeFile', 'getKnowledgeFileAttachments'],
  CredentialDAO:         ['CredentialDAO', 'saveCredential', 'getCredentialById', 'getCredentialByKey', 'listCredentials', 'listCredentialsByService', 'deleteCredential', 'deleteCredentialByKey'],
  ApiKeyDAO:             ['ApiKeyDAO'],
  ChannelDAO:            ['ChannelDAO', 'ChannelDao'],
  ChannelMemberDAO:      ['ChannelMemberDAO', 'ChannelMemberDao'],
  ChannelMessageDAO:     ['ChannelMessageDAO', 'ChannelMessageDao'],
  ChannelBridgeDAO:      ['ChannelBridgeDAO', 'ChannelBridgeDao'],
  SettingsDAO:           ['SettingsDAO', 'getSetting', 'setSetting', 'getDoclingConfig', 'setDoclingConfig', 'getStorageConfig', 'setStorageConfig'],
}

// Old import patterns to remove
const OLD_IMPORT_PATTERNS = [
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/db|\.\/db|\.\.\/db|\.\/lib\/db)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/user-dao|\.\/user-dao|\.\.\/lib\/user-dao)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/certificate-dao|\.\/certificate-dao|\.\.\/lib\/certificate-dao)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/channel-dao|\.\/channel-dao|\.\.\/lib\/channel-dao)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/channel-member-dao|\.\/channel-member-dao|\.\.\/lib\/channel-member-dao)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/channel-message-dao|\.\/channel-message-dao|\.\.\/lib\/channel-message-dao)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/channel-bridge-dao|\.\/channel-bridge-dao|\.\.\/lib\/channel-bridge-dao)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/delegation-dao|\.\/delegation-dao|\.\.\/lib\/delegation-dao)['"]\s*;?\n?/gm,
  /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"](@\/lib\/grant-dao|\.\/grant-dao|\.\.\/lib\/grant-dao)['"]\s*;?\n?/gm,
]

// ─── Helper: determine which DAOs a file needs based on content ───────────────
function detectNeededDAOs(content) {
  const needed = new Set()
  for (const [dao, triggers] of Object.entries(DAO_SOURCES)) {
    if (triggers.some(t => content.includes(t))) {
      needed.add(dao)
    }
  }
  return needed
}

// ─── Helper: build the import statement for the needed DAOs ──────────────────
function buildDaoImport(needed, isLibFile) {
  if (needed.size === 0) return ''
  const importPath = isLibFile ? '../db' : '@/db'
  const names = [...needed].sort().join(', ')
  return `import { ${names} } from "${importPath}";\n`
}

// ─── Helper: replace function calls with DAO equivalents ─────────────────────
function replaceFunctionCalls(content) {
  // Sort by length desc to avoid partial replacements
  const entries = Object.entries(FUNC_MAP).sort((a, b) => b[0].length - a[0].length)

  for (const [oldFn, newExpr] of entries) {
    // For zero-arg replacements like 'getAllRealms()' that end with ()
    if (newExpr.endsWith(')')) {
      // Replace: oldFn() → newExpr
      const re = new RegExp(`(?<!await\\s)\\b${escapeRegex(oldFn)}\\(\\)`, 'g')
      content = content.replace(re, newExpr)
      // Also handle when already awaited: await oldFn() → newExpr
      const re2 = new RegExp(`await\\s+${escapeRegex(oldFn)}\\(\\)`, 'g')
      content = content.replace(re2, newExpr)
    } else {
      // Replace: oldFn( → newExpr(
      const re = new RegExp(`(?<!await\\s)(?<![.])\\b${escapeRegex(oldFn)}\\(`, 'g')
      content = content.replace(re, `${newExpr}(`)
      // Also handle when already awaited: await oldFn( → newExpr(
      const re2 = new RegExp(`await\\s+${escapeRegex(oldFn)}\\(`, 'g')
      content = content.replace(re2, `${newExpr}(`)
    }
  }
  return content
}

// ─── Helper: rename field accesses ───────────────────────────────────────────
function renameFields(content) {
  for (const [pattern, replacement] of FIELD_RENAMES) {
    content = content.replace(pattern, replacement)
  }
  return content
}

// ─── Helper: remove JSON.parse calls on fields that are now native JSON ───────
function removeJsonParse(content) {
  // JSON.parse(x.capabilities) → x.capabilities
  const jsonFields = [
    'capabilities', 'llm_config', 'llmConfig', 'definition', 'results',
    'config', 'metadata', 'reactions', 'allowed_routes', 'allowedRoutes',
    'config_schema', 'configSchema', 'default_capabilities', 'defaultCapabilities',
    'allowed_capabilities', 'allowedCapabilities', 'resource_limits', 'resourceLimits',
    'params', 'output', 'allowed_model_ids', 'allowedModelIds',
    'requested_capabilities', 'requestedCapabilities', 'assigned_capabilities', 'assignedCapabilities',
  ]
  for (const field of jsonFields) {
    // JSON.parse(something.field) → something.field
    const re = new RegExp(`JSON\\.parse\\(([^)]+\\.${field})\\)`, 'g')
    content = content.replace(re, '$1')
    // JSON.parse(variable) where variable name ends with the field
    const re2 = new RegExp(`JSON\\.parse\\((${field})\\)`, 'g')
    content = content.replace(re2, '$1')
  }
  return content
}

// ─── Helper: escape regex special chars ──────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Process a single file ───────────────────────────────────────────────────
function processFile(filePath) {
  const isLibFile = filePath.includes('/lib/')
  const fullPath = path.join(BASE, filePath)

  if (!fs.existsSync(fullPath)) {
    console.log(`  SKIP (not found): ${filePath}`)
    return false
  }

  let content = fs.readFileSync(fullPath, 'utf8')
  const original = content

  // Check if this file imports from the old DB layer
  const hasOldImports = OLD_IMPORT_PATTERNS.some(p => {
    p.lastIndex = 0
    return p.test(content)
  }) || content.includes('from "./db"') || content.includes("from './db'")
    || content.includes('UserDao.') || content.includes('GrantDao.')
    || content.includes('DelegationDao.') || content.includes('ChannelDao.')
    || content.includes('ChannelMemberDao.') || content.includes('ChannelMessageDao.')
    || content.includes('ChannelBridgeDao.')

  if (!hasOldImports) {
    return false
  }

  // Detect which DAOs are needed (before transformations so we can detect old names)
  const needed = detectNeededDAOs(content)

  // Remove old imports
  for (const pattern of OLD_IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    content = content.replace(pattern, '')
  }
  // Also remove getDb import lines
  content = content.replace(/import\s+\{\s*getDb[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?\n?/gm, '')
  content = content.replace(/const\s+(?:db|d)\s*=\s*getDb\(\)\s*;?\n?/gm, '')

  // Replace function calls
  content = replaceFunctionCalls(content)

  // Rename field accesses
  content = renameFields(content)

  // Remove unnecessary JSON.parse
  content = removeJsonParse(content)

  // Add new DAO imports at the top (after other imports or at very top)
  const daoImport = buildDaoImport(needed, isLibFile)
  if (daoImport && !content.includes(`from "${isLibFile ? '../db' : '@/db'}"`)) {
    // Insert after the last existing import line
    const lastImportMatch = content.match(/^(import\s+.+;\n)+/m)
    if (lastImportMatch) {
      const insertIdx = lastImportMatch.index + lastImportMatch[0].length
      content = content.slice(0, insertIdx) + daoImport + content.slice(insertIdx)
    } else {
      content = daoImport + '\n' + content
    }
  }

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8')
    return true
  }
  return false
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const filesToProcess = [
  // lib files
  'lib/ws-server.ts',
  'lib/auth-handler.ts',
  'lib/auth-utils.ts',
  'lib/delegation.ts',
  'lib/entra-sync.ts',
  'lib/message-dispatcher.ts',
  'lib/peerjs-server.ts',
  'lib/smtp.ts',
  'lib/user-server-channel.ts',
  'lib/vault.ts',
  'lib/workflow-templates.ts',
  'lib/certificate-dao.ts',
  'lib/channel-bridge-dao.ts',
  'lib/channel-dao.ts',
  'lib/channel-member-dao.ts',
  'lib/channel-message-dao.ts',
  'lib/delegation-dao.ts',
  'lib/grant-dao.ts',
  'lib/user-dao.ts',
  // all app/api routes
  ...fs.readdirSync(path.join(BASE, 'app/api'), { recursive: true })
    .filter(f => f.endsWith('route.ts'))
    .map(f => `app/api/${f}`),
]

let changed = 0
let unchanged = 0
let errors = 0

for (const file of filesToProcess) {
  try {
    const wasChanged = processFile(file)
    if (wasChanged) {
      console.log(`  ✓ ${file}`)
      changed++
    } else {
      unchanged++
    }
  } catch (err) {
    console.error(`  ✗ ${file}: ${err.message}`)
    errors++
  }
}

console.log(`\nDone: ${changed} updated, ${unchanged} unchanged, ${errors} errors`)
