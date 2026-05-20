/**
 * SQLite database setup using better-sqlite3
 * Stores agent identities, auth sessions, and control plane settings
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { VaultysId } from "@vaultys/id";

// Use globalThis so the DB singleton survives Next.js module re-evaluation
const globalForDB = globalThis as unknown as { __db?: Database.Database };

const DB_PATH = path.resolve(process.cwd(), "data", "vaultysclaw.db");

/**
 * Get or create the singleton database instance
 */
export function getDb(): Database.Database {
  if (globalForDB.__db) return globalForDB.__db;

  // Ensure the data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createTables(db);
  seedDefaults(db);
  ensureServerIdentity(db);

  globalForDB.__db = db;
  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entra_identities (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      mail TEXT,
      user_principal_name TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      did TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      public_key TEXT,
      capabilities TEXT NOT NULL DEFAULT '[]',
      certificate_data TEXT,
      llm_config TEXT DEFAULT NULL,
      token_budget_daily INTEGER DEFAULT NULL,
      token_budget_monthly INTEGER DEFAULT NULL,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      certificate_data TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT -1,
      agent_did TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      agent_did TEXT,
      agent_name TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_registrations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_capabilities TEXT NOT NULL DEFAULT '[]',
      assigned_capabilities TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      did TEXT UNIQUE,
      public_key TEXT,
      name TEXT,
      email TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'member',
      reports_to TEXT REFERENCES users(id) ON DELETE SET NULL,
      description TEXT,
      entra_id TEXT REFERENCES entra_identities(id) ON DELETE SET NULL,
      claimed_at TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_did ON users(did);
    CREATE INDEX IF NOT EXISTS idx_users_entra_id ON users(entra_id);

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      registration TEXT UNIQUE,
      connection TEXT UNIQUE,
      register INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT -1,
      metadata TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_grants (
      id TEXT PRIMARY KEY,
      user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
      agent_did TEXT,
      capabilities TEXT NOT NULL DEFAULT '[]',
      granted_by TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS delegation_certs (
      id TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL REFERENCES user_grants(id) ON DELETE CASCADE,
      user_did TEXT NOT NULL,
      agent_did TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      certificate TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_peer_grants (
      id TEXT PRIMARY KEY,
      source_did TEXT NOT NULL,
      target_did TEXT NOT NULL,
      target_name TEXT NOT NULL,
      skill_description TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      certificate TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_peer_grants_source ON agent_peer_grants(source_did);
    CREATE INDEX IF NOT EXISTS idx_peer_grants_target ON agent_peer_grants(target_did);

    CREATE TABLE IF NOT EXISTS agent_token_usage (
      agent_did TEXT PRIMARY KEY,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_token_usage_history (
      agent_did TEXT NOT NULL,
      bucket TEXT NOT NULL,
      granularity TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_did, bucket, granularity)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_token_history_did ON agent_token_usage_history(agent_did, granularity, bucket);

    CREATE TABLE IF NOT EXISTS realms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#6366f1',
      is_default INTEGER NOT NULL DEFAULT 0,
      llm_config TEXT DEFAULT NULL,
      default_capabilities TEXT NOT NULL DEFAULT '[]',
      token_budget_daily INTEGER DEFAULT NULL,
      token_budget_monthly INTEGER DEFAULT NULL,
      allowed_capabilities TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS realm_token_usage (
      realm_id TEXT PRIMARY KEY REFERENCES realms(id) ON DELETE CASCADE,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_realms (
      agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_did, realm_id)
    );

    CREATE TABLE IF NOT EXISTS user_realms (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_realm_admin INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, realm_id)
    );

    CREATE TABLE IF NOT EXISTS realm_skills (
      id TEXT PRIMARY KEY,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT,
      is_required INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL DEFAULT '{}',
      content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(realm_id, name)
    );

    CREATE TABLE IF NOT EXISTS agent_skill_overrides (
      agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
      realm_skill_id TEXT NOT NULL REFERENCES realm_skills(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (agent_did, realm_skill_id)
    );

    CREATE TABLE IF NOT EXISTS model_registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_enc TEXT,
      litellm_model_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_model_registry_status ON model_registry(status);

    CREATE TABLE IF NOT EXISTS model_realm_access (
      model_id TEXT NOT NULL REFERENCES model_registry(id) ON DELETE CASCADE,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (model_id, realm_id)
    );
    CREATE INDEX IF NOT EXISTS idx_model_realm_access_realm ON model_realm_access(realm_id);

    CREATE TABLE IF NOT EXISTS realm_router_keys (
      realm_id TEXT PRIMARY KEY REFERENCES realms(id) ON DELETE CASCADE,
      litellm_virtual_key TEXT,
      allowed_model_ids TEXT NOT NULL DEFAULT '[]',
      monthly_budget_usd REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      agent_did TEXT,
      realm_id TEXT REFERENCES realms(id) ON DELETE SET NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      resource_limits TEXT DEFAULT NULL,
      expires_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_policies_agent ON policies(agent_did);
    CREATE INDEX IF NOT EXISTS idx_policies_realm ON policies(realm_id);

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      definition TEXT NOT NULL,
      realm_id TEXT REFERENCES realms(id) ON DELETE SET NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON workflows(created_by, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflows_realm ON workflows(realm_id);

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      results TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      agent_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps(run_id, step_id);

    CREATE TABLE IF NOT EXISTS workflow_approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      node_message TEXT,
      step_input TEXT,
      assigned_user_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'approval',
      status TEXT NOT NULL DEFAULT 'pending',
      decided_at TEXT,
      decided_by TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_approvals_user ON workflow_approvals(assigned_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_workflow_approvals_run ON workflow_approvals(run_id);

    CREATE TABLE IF NOT EXISTS intent_log (
      intent_id TEXT PRIMARY KEY,
      agent_did TEXT,
      action TEXT NOT NULL,
      params TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT,
      error TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_intent_log_agent ON intent_log(agent_did, sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_intent_log_status ON intent_log(status, sent_at DESC);
  `);

  // Add content column to realm_skills for existing databases that predate this field
  try {
    db.prepare("ALTER TABLE realm_skills ADD COLUMN content TEXT").run();
  } catch {
    // Column already exists — safe to ignore
  }
}

function seedDefaults(db: Database.Database): void {
  const realmCount = (db.prepare("SELECT COUNT(*) AS n FROM realms").get() as { n: number }).n;
  if (realmCount === 0) {
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO realms (id, name, slug, description, color, is_default) VALUES (?, ?, ?, ?, ?, 1)"
    ).run(id, "Default", "default", "The default realm", "#6366f1");
  }
}

/**
 * Check if server identity exists (does NOT create it — use initServerIdentity for that)
 */
function ensureServerIdentity(_db: Database.Database): void {
  // No-op: server identity is created asynchronously via initServerIdentity()
}

/**
 * Async initialization of server identity. Call once at startup before accepting connections.
 */
export async function initServerIdentity(): Promise<void> {
  const d = getDb();
  const row = d.prepare("SELECT value FROM settings WHERE key = ?").get("serverSecret") as
    | { value: string }
    | undefined;

  if (!row) {
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    const secret = vid.getSecret("base64");
    d.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("serverSecret", secret);
  }
}

/**
 * Get a setting value
 */
export function getSetting(key: string): string | undefined {
  const d = getDb();
  const row = d.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

/**
 * Set a setting value
 */
export function setSetting(key: string, value: string): void {
  const d = getDb();
  d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// --- Auth session operations ---

export interface AuthSessionRow {
  id: string;
  session_key: string;
  certificate_data: string;
  status: number;
  agent_did: string | null;
  created_at: string;
}

export function createAuthSession(id: string, sessionKey: string): void {
  const d = getDb();
  d.prepare("INSERT INTO auth_sessions (id, session_key) VALUES (?, ?)").run(id, sessionKey);
}

export function getAuthSession(id: string): AuthSessionRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM auth_sessions WHERE id = ?").get(id) as AuthSessionRow | undefined;
}

export function updateAuthSession(
  id: string,
  updates: { certificate_data?: string; status?: number; agent_did?: string }
): void {
  const d = getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (updates.certificate_data !== undefined) {
    sets.push("certificate_data = ?");
    values.push(updates.certificate_data);
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  if (updates.agent_did !== undefined) {
    sets.push("agent_did = ?");
    values.push(updates.agent_did);
  }

  if (sets.length === 0) return;
  values.push(id);
  d.prepare(`UPDATE auth_sessions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteExpiredAuthSessions(maxAgeSeconds: number): number {
  const d = getDb();
  const result = d
    .prepare("DELETE FROM auth_sessions WHERE created_at < datetime('now', ? || ' seconds')")
    .run(`-${maxAgeSeconds}`);
  return result.changes;
}

// --- Agent operations ---

export interface AgentRow {
  did: string;
  name: string;
  public_key: string | null;
  capabilities: string;
  certificate_data: string | null;
  llm_config: string | null; // JSON-encoded LlmConfig or null
  token_budget_daily: number | null;
  token_budget_monthly: number | null;
  registered_at: string;
  last_seen: string;
}

export function upsertAgent(agent: {
  did: string;
  name: string;
  publicKey?: string;
  capabilities: string[];
  certificateData?: string;
}): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO agents (did, name, public_key, capabilities, certificate_data, last_seen)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(did) DO UPDATE SET
      name = excluded.name,
      public_key = excluded.public_key,
      capabilities = excluded.capabilities,
      certificate_data = excluded.certificate_data,
      last_seen = datetime('now')
  `).run(
    agent.did,
    agent.name,
    agent.publicKey ?? null,
    JSON.stringify(agent.capabilities),
    agent.certificateData ?? null
  );
}

export function getAgent(did: string): AgentRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM agents WHERE did = ?").get(did) as AgentRow | undefined;
}

export function getAgentByName(name: string): AgentRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM agents WHERE name = ?").get(name) as AgentRow | undefined;
}

export function getAllAgents(): AgentRow[] {
  const d = getDb();
  return d.prepare("SELECT * FROM agents ORDER BY last_seen DESC").all() as AgentRow[];
}

export interface AgentQueryOptions {
  /** Full-text search across name and capabilities (case-insensitive) */
  q?: string;
  /** Filter by online status (requires connected DID set) */
  onlineDids?: Set<string>;
  online?: boolean;
  /** Filter by realm slug or id */
  realm?: string;
  /** Filter by capabilities (match ALL selected) */
  capabilities?: string[];
  /** Pagination */
  page?: number;
  pageSize?: number;
  /** Sort field: name | lastSeen | registeredAt */
  sortBy?: "name" | "lastSeen" | "registeredAt";
  sortDir?: "asc" | "desc";
}

export interface AgentQueryResult {
  agents: AgentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function queryAgents(opts: AgentQueryOptions = {}): AgentQueryResult {
  const d = getDb();
  const {
    q,
    onlineDids,
    online,
    realm,
    capabilities,
    page = 1,
    pageSize = 20,
    sortBy = "lastSeen",
    sortDir = "desc",
  } = opts;

  const sortColumn =
    sortBy === "name" ? "a.name" :
      sortBy === "registeredAt" ? "a.registered_at" :
        "a.last_seen";
  const dir = sortDir === "asc" ? "ASC" : "DESC";

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    conditions.push("(LOWER(a.name) LIKE ? OR LOWER(a.capabilities) LIKE ?)");
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like);
  }

  if (realm) {
    conditions.push("EXISTS (SELECT 1 FROM agent_realms ar JOIN realms r ON r.id = ar.realm_id WHERE ar.agent_did = a.did AND (r.id = ? OR r.slug = ?))");
    params.push(realm, realm);
  }

  if (capabilities && capabilities.length > 0) {
    // Each selected capability must be in the agent's JSON capabilities array
    const capConditions = capabilities.map(() =>
      "EXISTS (SELECT 1 FROM json_each(a.capabilities) WHERE json_each.value = ?)"
    );
    conditions.push(`(${capConditions.join(" AND ")})`);
    params.push(...capabilities);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = (d.prepare(`SELECT COUNT(*) AS count FROM agents a ${where}`).get(...params) as { count: number }).count;

  const offset = (page - 1) * pageSize;
  const rows = d.prepare(
    `SELECT a.* FROM agents a ${where} ORDER BY ${sortColumn} ${dir} LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as AgentRow[];

  // Apply in-memory online filter (requires live WS data not available in DB)
  const filtered = online !== undefined && onlineDids
    ? rows.filter((r) => onlineDids.has(r.did) === online)
    : rows;

  return {
    agents: filtered,
    total: online !== undefined ? filtered.length : total,
    page,
    pageSize,
    totalPages: Math.ceil((online !== undefined ? filtered.length : total) / pageSize),
  };
}

export function updateAgentLastSeen(did: string): void {
  const d = getDb();
  d.prepare("UPDATE agents SET last_seen = datetime('now') WHERE did = ?").run(did);
}

/**
 * Persist (or clear) the LLM config for an agent.
 * Pass null to clear — agent will fall back to its local env-var config.
 */
export function setAgentLlmConfig(did: string, config: import("@vaultysclaw/shared").LlmConfig | null): void {
  const d = getDb();
  d.prepare("UPDATE agents SET llm_config = ? WHERE did = ?").run(
    config !== null ? JSON.stringify(config) : null,
    did
  );
}

/**
 * Close and cleanup database connection
 */
export function closeDb(): void {
  if (globalForDB.__db) {
    globalForDB.__db.close();
    delete globalForDB.__db;
  }
}

// --- Activity log ---

export interface ActivityLogRow {
  id: number;
  event: string;
  agent_did: string | null;
  agent_name: string | null;
  details: string | null;
  created_at: string;
}

export function logActivity(
  event: string,
  agentDid?: string,
  agentName?: string,
  details?: string,
): void {
  const d = getDb();
  d.prepare(
    "INSERT INTO activity_log (event, agent_did, agent_name, details) VALUES (?, ?, ?, ?)"
  ).run(event, agentDid ?? null, agentName ?? null, details ?? null);
}

export function getActivityLog(limit: number = 100): ActivityLogRow[] {
  const d = getDb();
  return d
    .prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ActivityLogRow[];
}

export function getActivityLogByEvent(event: string, limit: number = 50): ActivityLogRow[] {
  const d = getDb();
  return d
    .prepare("SELECT * FROM activity_log WHERE event = ? ORDER BY created_at DESC LIMIT ?")
    .all(event, limit) as ActivityLogRow[];
}

// --- Intent log ---

export interface IntentLogRow {
  intent_id: string;
  agent_did: string | null;
  action: string;
  params: string | null;
  status: string;
  output: string | null;
  error: string | null;
  sent_at: string;
  completed_at: string | null;
}

export function logIntent(intentId: string, agentDid: string | undefined, action: string, params: Record<string, unknown>): void {
  const d = getDb();
  d.prepare(
    "INSERT OR IGNORE INTO intent_log (intent_id, agent_did, action, params) VALUES (?, ?, ?, ?)"
  ).run(intentId, agentDid ?? null, action, JSON.stringify(params));
}

export function updateIntentResult(intentId: string, status: "success" | "failed", output?: unknown, error?: string): void {
  const d = getDb();
  d.prepare(
    "UPDATE intent_log SET status = ?, output = ?, error = ?, completed_at = datetime('now') WHERE intent_id = ?"
  ).run(status, output !== undefined ? JSON.stringify(output) : null, error ?? null, intentId);
}

export function getIntentLog(limit: number = 100, agentDid?: string): IntentLogRow[] {
  const d = getDb();
  if (agentDid) {
    return d
      .prepare("SELECT * FROM intent_log WHERE agent_did = ? ORDER BY sent_at DESC LIMIT ?")
      .all(agentDid, limit) as IntentLogRow[];
  }
  return d
    .prepare("SELECT * FROM intent_log ORDER BY sent_at DESC LIMIT ?")
    .all(limit) as IntentLogRow[];
}

// --- Pending registrations ---

export interface PendingRegistrationRow {
  id: string;
  session_id: string;
  agent_name: string;
  status: "pending" | "approved" | "rejected";
  requested_capabilities: string; // JSON array — what the agent requested
  assigned_capabilities: string;  // JSON array — what the admin assigned
  created_at: string;
}

export function createPendingRegistration(
  id: string,
  sessionId: string,
  agentName: string,
  requestedCapabilities: string[] = [],
): void {
  const d = getDb();
  d.prepare(
    "INSERT INTO pending_registrations (id, session_id, agent_name, requested_capabilities) VALUES (?, ?, ?, ?)"
  ).run(id, sessionId, agentName, JSON.stringify(requestedCapabilities));
}

export function getPendingRegistration(id: string): PendingRegistrationRow | undefined {
  const d = getDb();
  return d
    .prepare("SELECT * FROM pending_registrations WHERE id = ?")
    .get(id) as PendingRegistrationRow | undefined;
}

export function getAllPendingRegistrations(): PendingRegistrationRow[] {
  const d = getDb();
  return d
    .prepare("SELECT * FROM pending_registrations ORDER BY created_at DESC")
    .all() as PendingRegistrationRow[];
}

export function updatePendingRegistration(
  id: string,
  status: "approved" | "rejected",
  capabilities?: string[],
): boolean {
  const d = getDb();
  const result = d
    .prepare(
      "UPDATE pending_registrations SET status = ?, assigned_capabilities = ? WHERE id = ? AND status = 'pending'"
    )
    .run(status, JSON.stringify(capabilities ?? []), id);
  return result.changes > 0;
}

export function deletePendingRegistration(id: string): void {
  const d = getDb();
  d.prepare("DELETE FROM pending_registrations WHERE id = ?").run(id);
}

// ---- Realms ----


export interface RealmRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_default: number;
  llm_config: string | null;
  default_capabilities: string;
  token_budget_daily: number | null;
  token_budget_monthly: number | null;
  allowed_capabilities: string | null; // JSON array or null (null = unrestricted)
  created_at: string;
}

export interface PolicyRow {
  id: string;
  agent_did: string | null;
  realm_id: string | null;
  capabilities: string; // JSON array
  resource_limits: string | null; // JSON object or null
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export function getAllRealms(): RealmRow[] {
  const d = getDb();
  return d.prepare("SELECT * FROM realms ORDER BY is_default DESC, name ASC").all() as RealmRow[];
}

export function getRealmById(id: string): RealmRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM realms WHERE id = ?").get(id) as RealmRow | undefined;
}

export function getRealmBySlug(slug: string): RealmRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM realms WHERE slug = ?").get(slug) as RealmRow | undefined;
}

export function getDefaultRealm(): RealmRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM realms WHERE is_default = 1 LIMIT 1").get() as RealmRow | undefined;
}

export function createRealm(realm: {
  name: string;
  slug: string;
  description?: string;
  color?: string;
}): RealmRow {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare(
    "INSERT INTO realms (id, name, slug, description, color) VALUES (?, ?, ?, ?, ?)"
  ).run(id, realm.name, realm.slug, realm.description ?? null, realm.color ?? "#6366f1");
  return getRealmById(id)!;
}

export function updateRealm(
  id: string,
  updates: Partial<Pick<RealmRow, "name" | "slug" | "description" | "color" | "llm_config" | "default_capabilities" | "token_budget_daily" | "token_budget_monthly" | "allowed_capabilities">>
): void {
  const d = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(updates)) {
    sets.push(`${k} = ?`);
    values.push(v);
  }
  if (sets.length === 0) return;
  values.push(id);
  d.prepare(`UPDATE realms SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteRealm(id: string): boolean {
  const d = getDb();
  const realm = getRealmById(id);
  if (!realm || realm.is_default) return false; // cannot delete the default realm
  d.prepare("DELETE FROM realms WHERE id = ?").run(id);
  return true;
}

export function setDefaultRealm(id: string): void {
  const d = getDb();
  d.prepare("UPDATE realms SET is_default = 0").run();
  d.prepare("UPDATE realms SET is_default = 1 WHERE id = ?").run(id);
}

// ---- Realm membership: agents ----

export interface RealmMembershipRow {
  realm_id: string;
  name: string;
  slug: string;
  color: string;
  is_default: number;
  is_primary: number;
  is_realm_admin: number;
  joined_at: string;
}

export function getAgentRealms(agentDid: string): RealmMembershipRow[] {
  const d = getDb();
  return d.prepare(`
    SELECT r.id AS realm_id, r.name, r.slug, r.color, r.is_default,
           ar.is_primary, ar.joined_at
    FROM agent_realms ar
    JOIN realms r ON r.id = ar.realm_id
    WHERE ar.agent_did = ?
    ORDER BY ar.is_primary DESC, r.name ASC
  `).all(agentDid) as RealmMembershipRow[];
}

export function addAgentToRealm(agentDid: string, realmId: string, isPrimary = false): void {
  const d = getDb();
  if (isPrimary) {
    // Clear existing primary for this agent
    d.prepare("UPDATE agent_realms SET is_primary = 0 WHERE agent_did = ?").run(agentDid);
  }
  d.prepare(
    "INSERT OR REPLACE INTO agent_realms (agent_did, realm_id, is_primary) VALUES (?, ?, ?)"
  ).run(agentDid, realmId, isPrimary ? 1 : 0);
}

export function removeAgentFromRealm(agentDid: string, realmId: string): boolean {
  const d = getDb();
  const realm = getRealmById(realmId);
  if (realm?.is_default) return false; // can't leave the default realm
  const result = d.prepare("DELETE FROM agent_realms WHERE agent_did = ? AND realm_id = ?").run(agentDid, realmId);
  return result.changes > 0;
}

export function getRealmAgents(realmId: string): (RealmRow & { agent_did: string; agent_name: string; is_primary: number })[] {
  const d = getDb();
  return d.prepare(`
    SELECT a.did AS agent_did, a.name AS agent_name, a.capabilities,
           ar.is_primary, ar.joined_at,
           r.id, r.name, r.slug, r.color, r.is_default
    FROM agent_realms ar
    JOIN agents a ON a.did = ar.agent_did
    JOIN realms r ON r.id = ar.realm_id
    WHERE ar.realm_id = ?
    ORDER BY ar.is_primary DESC, a.name ASC
  `).all(realmId) as any[];
}

// ---- Realm membership: users ----

export function getUserRealms(userId: string): RealmMembershipRow[] {
  const d = getDb();
  return d.prepare(`
    SELECT r.id AS realm_id, r.name, r.slug, r.color, r.is_default,
           ur.is_primary, ur.is_realm_admin, ur.joined_at
    FROM user_realms ur
    JOIN realms r ON r.id = ur.realm_id
    WHERE ur.user_id = ?
    ORDER BY ur.is_primary DESC, r.name ASC
  `).all(userId) as RealmMembershipRow[];
}

export function isUserInRealm(userId: string, realmId: string): boolean {
  const d = getDb();
  const row = d.prepare("SELECT 1 FROM user_realms WHERE user_id = ? AND realm_id = ?").get(userId, realmId);
  return row !== undefined;
}

export function isUserRealmAdmin(userId: string, realmId: string): boolean {
  const d = getDb();
  const row = d.prepare("SELECT is_realm_admin FROM user_realms WHERE user_id = ? AND realm_id = ?").get(userId, realmId) as { is_realm_admin: number } | undefined;
  return row?.is_realm_admin === 1;
}

export function setUserRealmAdmin(userId: string, realmId: string, isAdmin: boolean): boolean {
  const d = getDb();
  const result = d.prepare("UPDATE user_realms SET is_realm_admin = ? WHERE user_id = ? AND realm_id = ?").run(isAdmin ? 1 : 0, userId, realmId);
  return result.changes > 0;
}

export function addUserToRealm(userId: string, realmId: string, isPrimary = false, isRealmAdmin = false): void {
  const d = getDb();
  if (isPrimary) {
    d.prepare("UPDATE user_realms SET is_primary = 0 WHERE user_id = ?").run(userId);
  }
  d.prepare(
    "INSERT OR REPLACE INTO user_realms (user_id, realm_id, is_primary, is_realm_admin) VALUES (?, ?, ?, ?)"
  ).run(userId, realmId, isPrimary ? 1 : 0, isRealmAdmin ? 1 : 0);
}

export function removeUserFromRealm(userId: string, realmId: string): boolean {
  const d = getDb();
  const realm = getRealmById(realmId);
  if (realm?.is_default) return false;
  const result = d.prepare("DELETE FROM user_realms WHERE user_id = ? AND realm_id = ?").run(userId, realmId);
  return result.changes > 0;
}

export function getRealmUsers(realmId: string): { user_id: string; did: string | null; name: string | null; email: string | null; is_primary: number; is_realm_admin: number; joined_at: string }[] {
  const d = getDb();
  return d.prepare(`
    SELECT u.id AS user_id, u.did, u.name, u.email, ur.is_primary, ur.is_realm_admin, ur.joined_at
    FROM user_realms ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.realm_id = ?
    ORDER BY ur.is_primary DESC, u.name ASC
  `).all(realmId) as any[];
}

/** Auto-enroll an agent or user into the default realm (called after registration). */
export function enrollInDefaultRealm(type: "agent", did: string): void;
export function enrollInDefaultRealm(type: "user", did: string): void;
export function enrollInDefaultRealm(type: "agent" | "user", did: string): void {
  const realm = getDefaultRealm();
  if (!realm) return;
  if (type === "agent") addAgentToRealm(did, realm.id, true);
  else addUserToRealm(did, realm.id, true);
}

// ---- Token usage tracking ----

export interface AgentTokenUsageRow {
  agent_did: string;
  prompt_tokens: number;
  completion_tokens: number;
  updated_at: string;
}

export function getAgentTokenUsage(agentDid: string): AgentTokenUsageRow | undefined {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM agent_token_usage WHERE agent_did = ?"
  ).get(agentDid) as AgentTokenUsageRow | undefined;
}

export function getAllTokenUsage(): AgentTokenUsageRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM agent_token_usage ORDER BY updated_at DESC"
  ).all() as AgentTokenUsageRow[];
}

export function upsertTokenUsage(
  agentDid: string,
  promptTokens: number,
  completionTokens: number
): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO agent_token_usage (agent_did, prompt_tokens, completion_tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(agent_did) DO UPDATE SET
      prompt_tokens = excluded.prompt_tokens,
      completion_tokens = excluded.completion_tokens,
      updated_at = datetime('now')
  `).run(agentDid, promptTokens, completionTokens);
}

export function getTotalFleetTokenUsage(): { promptTokens: number; completionTokens: number } {
  const d = getDb();
  const result = d.prepare(`
    SELECT
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens
    FROM agent_token_usage
  `).get() as { prompt_tokens: number; completion_tokens: number } | undefined;
  return {
    promptTokens: result?.prompt_tokens ?? 0,
    completionTokens: result?.completion_tokens ?? 0,
  };
}

// ---- Realm token usage tracking ----

export interface RealmTokenUsageRow {
  realm_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  updated_at: string;
}

export function getRealmTokenUsage(realmId: string): RealmTokenUsageRow | undefined {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM realm_token_usage WHERE realm_id = ?"
  ).get(realmId) as RealmTokenUsageRow | undefined;
}

export function getAllRealmTokenUsage(): RealmTokenUsageRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM realm_token_usage ORDER BY updated_at DESC"
  ).all() as RealmTokenUsageRow[];
}

export function upsertRealmTokenUsage(
  realmId: string,
  promptTokens: number,
  completionTokens: number
): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO realm_token_usage (realm_id, prompt_tokens, completion_tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(realm_id) DO UPDATE SET
      prompt_tokens = excluded.prompt_tokens,
      completion_tokens = excluded.completion_tokens,
      updated_at = datetime('now')
  `).run(realmId, promptTokens, completionTokens);
}

export function getTotalRealmTokenUsage(realmId: string): { promptTokens: number; completionTokens: number } {
  const d = getDb();
  const result = d.prepare(`
    SELECT
      COALESCE(prompt_tokens, 0) as prompt_tokens,
      COALESCE(completion_tokens, 0) as completion_tokens
    FROM realm_token_usage
    WHERE realm_id = ?
  `).get(realmId) as { prompt_tokens: number; completion_tokens: number } | undefined;
  return {
    promptTokens: result?.prompt_tokens ?? 0,
    completionTokens: result?.completion_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Agent token usage history (daily / monthly buckets)
// ---------------------------------------------------------------------------

export interface AgentTokenUsageHistoryRow {
  agent_did: string;
  bucket: string;
  granularity: "day" | "month";
  prompt_tokens: number;
  completion_tokens: number;
  updated_at: string;
}

/**
 * Increment token usage for the current day bucket and current month bucket for an agent.
 * Uses the provided delta values (tokens used since last heartbeat).
 */
export function addAgentTokenUsageHistory(
  agentDid: string,
  promptDelta: number,
  completionDelta: number,
): void {
  if (promptDelta <= 0 && completionDelta <= 0) return;
  const d = getDb();
  const dayBucket = new Date().toISOString().slice(0, 10);    // YYYY-MM-DD
  const monthBucket = new Date().toISOString().slice(0, 7);  // YYYY-MM

  const upsert = d.prepare(`
    INSERT INTO agent_token_usage_history (agent_did, bucket, granularity, prompt_tokens, completion_tokens, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(agent_did, bucket, granularity) DO UPDATE SET
      prompt_tokens = prompt_tokens + excluded.prompt_tokens,
      completion_tokens = completion_tokens + excluded.completion_tokens,
      updated_at = datetime('now')
  `);

  const txn = d.transaction(() => {
    upsert.run(agentDid, dayBucket, "day", promptDelta, completionDelta);
    upsert.run(agentDid, monthBucket, "month", promptDelta, completionDelta);
  });
  txn();
}

/**
 * Query per-agent token usage history.
 * @param granularity 'day' or 'month'
 * @param from ISO date string (inclusive), e.g. '2026-01-01'
 * @param to   ISO date string (inclusive), e.g. '2026-12-31'
 */
export function getAgentTokenUsageHistory(
  agentDid: string,
  granularity: "day" | "month",
  from: string,
  to: string,
): AgentTokenUsageHistoryRow[] {
  const d = getDb();
  return d.prepare(`
    SELECT * FROM agent_token_usage_history
    WHERE agent_did = ? AND granularity = ? AND bucket >= ? AND bucket <= ?
    ORDER BY bucket ASC
  `).all(agentDid, granularity, from, to) as AgentTokenUsageHistoryRow[];
}

// ---------------------------------------------------------------------------
// Workflow operations
// ---------------------------------------------------------------------------

export interface WorkflowDefinition {
  nodes: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data?: Record<string, unknown>;
  }>;
  /** Default input passed to the first node. Can be overridden at execution time. */
  input?: string;
}

export interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  definition: string;
  realm_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  results: string | null;
}

export interface WorkflowStepRow {
  id: string;
  run_id: string;
  step_id: string;
  agent_id: string | null;
  status: string;
  output: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Save a new workflow
 */
export function saveWorkflow(
  name: string,
  definition: WorkflowDefinition,
  createdBy?: string,
  realmId?: string,
): string {
  const d = getDb();
  const id = crypto.randomUUID();
  const defaultRealm = getDefaultRealm();
  const finalRealmId = realmId || defaultRealm?.id || "default";
  d.prepare(
    "INSERT INTO workflows (id, name, definition, created_by, realm_id) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, JSON.stringify(definition), createdBy ?? null, finalRealmId);
  return id;
}

/**
 * Get a single workflow by ID
 */
export function getWorkflow(id: string): WorkflowRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM workflows WHERE id = ?").get(id) as WorkflowRow | undefined;
}

/**
 * List all workflows, optionally filtered by creator or realm
 */
export function listWorkflows(createdBy?: string, realmId?: string): WorkflowRow[] {
  const d = getDb();
  if (createdBy && realmId) {
    return d.prepare("SELECT * FROM workflows WHERE created_by = ? AND realm_id = ? ORDER BY created_at DESC")
      .all(createdBy, realmId) as WorkflowRow[];
  }
  if (createdBy) {
    return d.prepare("SELECT * FROM workflows WHERE created_by = ? ORDER BY created_at DESC")
      .all(createdBy) as WorkflowRow[];
  }
  if (realmId) {
    return d.prepare("SELECT * FROM workflows WHERE realm_id = ? ORDER BY created_at DESC")
      .all(realmId) as WorkflowRow[];
  }
  return d.prepare("SELECT * FROM workflows ORDER BY created_at DESC").all() as WorkflowRow[];
}

/**
 * Update an existing workflow
 */
export function updateWorkflow(
  id: string,
  name?: string,
  definition?: WorkflowDefinition,
  description?: string,
  realmId?: string,
): void {
  const d = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) {
    updates.push("name = ?");
    values.push(name);
  }
  if (description !== undefined) {
    updates.push("description = ?");
    values.push(description);
  }
  if (definition !== undefined) {
    updates.push("definition = ?");
    values.push(JSON.stringify(definition));
  }
  if (realmId !== undefined) {
    updates.push("realm_id = ?");
    values.push(realmId);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    d.prepare(`UPDATE workflows SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
}

/**
 * Delete a workflow
 */
export function deleteWorkflow(id: string): void {
  const d = getDb();
  d.prepare("DELETE FROM workflows WHERE id = ?").run(id);
}

/**
 * Start a new workflow run
 */
export function startWorkflowRun(workflowId: string): string {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare(
    "INSERT INTO workflow_runs (id, workflow_id, status) VALUES (?, ?, 'running')"
  ).run(id, workflowId);
  return id;
}

/**
 * Get workflow run by ID
 */
export function getWorkflowRun(id: string): WorkflowRunRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id) as WorkflowRunRow | undefined;
}

/**
 * Update workflow run status and optionally completion
 */
export function updateWorkflowRunStatus(
  runId: string,
  status: "running" | "completed" | "failed",
  results?: Record<string, unknown>,
): void {
  const d = getDb();
  const completedAt = ["completed", "failed"].includes(status) ? "datetime('now')" : "NULL";
  const resultsStr = results ? JSON.stringify(results) : null;
  d.prepare(
    `UPDATE workflow_runs SET status = ?, completed_at = ${completedAt}, results = ? WHERE id = ?`
  ).run(status, resultsStr, runId);
}

/**
 * Record a workflow step execution
 */
export function recordWorkflowStep(
  runId: string,
  stepId: string,
  agentId?: string,
  status: string = "pending",
  output?: unknown,
  error?: string,
): string {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare(
    `INSERT INTO workflow_steps (id, run_id, step_id, agent_id, status, output, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    runId,
    stepId,
    agentId ?? null,
    status,
    output ? JSON.stringify(output) : null,
    error ?? null,
  );
  return id;
}

/**
 * Update a workflow step
 */
export function updateWorkflowStep(
  stepId: string,
  status?: string,
  output?: unknown,
  error?: string,
): void {
  const d = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (status !== undefined) {
    updates.push("status = ?");
    values.push(status);
    if (["success", "completed", "failed"].includes(status)) {
      updates.push("completed_at = datetime('now')");
    }
    if (status === "running") {
      updates.push("started_at = datetime('now')");
    }
  }
  if (output !== undefined) {
    updates.push("output = ?");
    values.push(JSON.stringify(output));
  }
  if (error !== undefined) {
    updates.push("error = ?");
    values.push(error);
  }

  if (updates.length > 0) {
    values.push(stepId);
    d.prepare(`UPDATE workflow_steps SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
}

/**
 * Query workflow runs with pagination and filtering
 */
export interface WorkflowRunQueryOptions {
  workflowId?: string;  // Filter by workflow ID
  status?: string;      // Filter by status
  page?: number;
  pageSize?: number;
  sortBy?: "startedAt" | "completedAt";  // Sort field
  sortDir?: "asc" | "desc";
}

export interface WorkflowRunQueryResult {
  runs: (WorkflowRunRow & { workflow_name: string })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function queryWorkflowRuns(opts: WorkflowRunQueryOptions = {}): WorkflowRunQueryResult {
  const d = getDb();
  const {
    workflowId,
    status,
    page = 1,
    pageSize = 20,
    sortBy = "startedAt",
    sortDir = "desc",
  } = opts;

  const sortColumn = sortBy === "completedAt" ? "wr.completed_at" : "wr.started_at";
  const dir = sortDir === "asc" ? "ASC" : "DESC";

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (workflowId) {
    conditions.push("wr.workflow_id = ?");
    params.push(workflowId);
  }

  if (status) {
    conditions.push("wr.status = ?");
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = (d.prepare(
    `SELECT COUNT(*) AS count FROM workflow_runs wr ${where}`
  ).get(...params) as { count: number }).count;

  const offset = (page - 1) * pageSize;
  const rows = d.prepare(
    `SELECT wr.*, w.name AS workflow_name FROM workflow_runs wr
     JOIN workflows w ON w.id = wr.workflow_id
     ${where}
     ORDER BY ${sortColumn} ${dir}
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as (WorkflowRunRow & { workflow_name: string })[];

  return {
    runs: rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get all steps for a workflow run
 */
export function getWorkflowRunSteps(runId: string): WorkflowStepRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY started_at ASC, rowid ASC"
  ).all(runId) as WorkflowStepRow[];
}

/**
 * Get complete workflow run history with steps
 */
export interface WorkflowStepWithUserRow extends WorkflowStepRow {
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_user_email: string | null;
}

export function getWorkflowRunHistory(
  runId: string,
): { run: WorkflowRunRow; workflow: WorkflowRow | null; steps: WorkflowStepWithUserRow[] } | undefined {
  const d = getDb();
  const run = d.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | undefined;
  if (!run) return undefined;

  const workflow = d.prepare("SELECT * FROM workflows WHERE id = ?").get(run.workflow_id) as WorkflowRow | undefined ?? null;

  const steps = d.prepare(`
    SELECT ws.*,
           wa.assigned_user_id,
           u.name  AS assigned_user_name,
           u.email AS assigned_user_email
    FROM workflow_steps ws
    LEFT JOIN workflow_approvals wa ON wa.run_id = ws.run_id AND wa.step_id = ws.step_id
    LEFT JOIN users u ON u.did = wa.assigned_user_id
    WHERE ws.run_id = ?
    ORDER BY ws.started_at ASC, ws.rowid ASC
  `).all(runId) as WorkflowStepWithUserRow[];

  return { run, workflow, steps };
}

// ---------------------------------------------------------------------------
// Workflow approval operations
// ---------------------------------------------------------------------------

export interface WorkflowApprovalRow {
  id: string;
  run_id: string;
  step_id: string;
  workflow_id: string;
  workflow_name: string;
  node_message: string | null;
  step_input: string | null;
  assigned_user_id: string;
  mode: string;
  status: string;
  decided_at: string | null;
  decided_by: string | null;
  comment: string | null;
  created_at: string;
}

/**
 * Create a pending approval (or notification) for a workflow step
 */
export function createWorkflowApproval(opts: {
  runId: string;
  stepId: string;
  workflowId: string;
  workflowName: string;
  nodeMessage?: string;
  stepInput?: string;
  assignedUserId: string;
  mode: "approval" | "notification";
}): string {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare(
    `INSERT INTO workflow_approvals
      (id, run_id, step_id, workflow_id, workflow_name, node_message, step_input, assigned_user_id, mode, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.runId,
    opts.stepId,
    opts.workflowId,
    opts.workflowName,
    opts.nodeMessage ?? null,
    opts.stepInput ?? null,
    opts.assignedUserId,
    opts.mode,
    opts.mode === "notification" ? "notified" : "pending",
  );
  return id;
}

/**
 * List pending approval/notification items for a user
 */
export function getPendingApprovalsForUser(userDid: string): WorkflowApprovalRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM workflow_approvals WHERE assigned_user_id = ? AND status IN ('pending','notified') ORDER BY created_at DESC"
  ).all(userDid) as WorkflowApprovalRow[];
}

/**
 * List all approvals for a user (pending + history)
 */
export function getAllApprovalsForUser(userDid: string): WorkflowApprovalRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM workflow_approvals WHERE assigned_user_id = ? ORDER BY created_at DESC"
  ).all(userDid) as WorkflowApprovalRow[];
}

/**
 * List all approvals for a run
 */
export function getApprovalsForRun(runId: string): WorkflowApprovalRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM workflow_approvals WHERE run_id = ? ORDER BY created_at ASC"
  ).all(runId) as WorkflowApprovalRow[];
}

/**
 * Resolve an approval (approve / reject)
 */
export function resolveWorkflowApproval(
  approvalId: string,
  decidedBy: string,
  decision: "approved" | "rejected",
  comment?: string,
): boolean {
  const d = getDb();
  const result = d.prepare(
    `UPDATE workflow_approvals
     SET status = ?, decided_at = datetime('now'), decided_by = ?, comment = ?
     WHERE id = ? AND status = 'pending'`
  ).run(decision, decidedBy, comment ?? null, approvalId);
  return (result.changes ?? 0) > 0;
}

/**
 * Dismiss a notification
 */
export function dismissWorkflowNotification(approvalId: string, userDid: string): boolean {
  const d = getDb();
  const result = d.prepare(
    `UPDATE workflow_approvals SET status = 'dismissed'
     WHERE id = ? AND assigned_user_id = ? AND mode = 'notification'`
  ).run(approvalId, userDid);
  return (result.changes ?? 0) > 0;
}

// ---- Realm skills ----

export interface RealmSkillRow {
  id: string;
  realm_id: string;
  name: string;
  description: string | null;
  version: string | null;
  is_required: number;
  config: string;
  content: string | null;
  created_at: string;
}

export function getRealmSkills(realmId: string): RealmSkillRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM realm_skills WHERE realm_id = ? ORDER BY is_required DESC, name ASC"
  ).all(realmId) as RealmSkillRow[];
}

export function getRealmSkillById(id: string): RealmSkillRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM realm_skills WHERE id = ?").get(id) as RealmSkillRow | undefined;
}

export function createRealmSkill(skill: {
  realmId: string;
  name: string;
  description?: string;
  version?: string;
  isRequired?: boolean;
  config?: Record<string, unknown>;
  content?: string;
}): RealmSkillRow {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare(`
    INSERT INTO realm_skills (id, realm_id, name, description, version, is_required, config, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    skill.realmId,
    skill.name,
    skill.description ?? null,
    skill.version ?? null,
    skill.isRequired ? 1 : 0,
    JSON.stringify(skill.config ?? {}),
    skill.content ?? null,
  );
  return getRealmSkillById(id)!;
}

export function updateRealmSkill(
  id: string,
  updates: { description?: string | null; version?: string | null; isRequired?: boolean; config?: Record<string, unknown>; content?: string | null },
): boolean {
  const d = getDb();
  const parts: string[] = [];
  const vals: unknown[] = [];
  if ("description" in updates) { parts.push("description = ?"); vals.push(updates.description ?? null); }
  if ("version" in updates) { parts.push("version = ?"); vals.push(updates.version ?? null); }
  if ("isRequired" in updates) { parts.push("is_required = ?"); vals.push(updates.isRequired ? 1 : 0); }
  if ("config" in updates) { parts.push("config = ?"); vals.push(JSON.stringify(updates.config)); }
  if ("content" in updates) { parts.push("content = ?"); vals.push(updates.content ?? null); }
  if (parts.length === 0) return false;
  vals.push(id);
  const result = d.prepare(`UPDATE realm_skills SET ${parts.join(", ")} WHERE id = ?`).run(...vals);
  return result.changes > 0;
}

export function deleteRealmSkill(id: string): boolean {
  const d = getDb();
  const result = d.prepare("DELETE FROM realm_skills WHERE id = ?").run(id);
  return result.changes > 0;
}

export interface SkillWithRealmRow {
  id: string;
  realm_id: string;
  realm_name: string;
  name: string;
  description: string | null;
  version: string | null;
  is_required: number;
  config: string;
  content: string | null;
  created_at: string;
  agent_count: number;
  override_count: number;
}

export function getAllSkillsWithRealms(): SkillWithRealmRow[] {
  const d = getDb();
  return d.prepare(`
    SELECT rs.id, rs.realm_id, r.name AS realm_name, rs.name, rs.description,
           rs.version, rs.is_required, rs.config, rs.content, rs.created_at,
           (SELECT COUNT(*) FROM agent_realms ar WHERE ar.realm_id = r.id) AS agent_count,
           (SELECT COUNT(*) FROM agent_skill_overrides aso WHERE aso.realm_skill_id = rs.id) AS override_count
    FROM realm_skills rs
    JOIN realms r ON r.id = rs.realm_id
    ORDER BY rs.name ASC, r.name ASC
  `).all() as SkillWithRealmRow[];
}

// ---- Agent skill overrides ----

export interface AgentSkillOverrideRow {
  agent_did: string;
  realm_skill_id: string;
  enabled: number;
}

export function getAgentSkillOverrides(agentDid: string): AgentSkillOverrideRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM agent_skill_overrides WHERE agent_did = ?"
  ).all(agentDid) as AgentSkillOverrideRow[];
}

export function setAgentSkillOverride(agentDid: string, realmSkillId: string, enabled: boolean): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO agent_skill_overrides (agent_did, realm_skill_id, enabled)
    VALUES (?, ?, ?)
    ON CONFLICT(agent_did, realm_skill_id) DO UPDATE SET enabled = excluded.enabled
  `).run(agentDid, realmSkillId, enabled ? 1 : 0);
}

/**
 * Compute the effective skill configuration for an agent:
 * aggregates realm skills from all realms the agent belongs to,
 * applies per-agent overrides, and returns the merged list.
 * Required skills cannot be disabled.
 */
export function getAgentEffectiveSkills(agentDid: string): import("@vaultysclaw/shared").SkillConfig[] {
  const d = getDb();
  const rows = d.prepare(`
    SELECT rs.id, rs.name, rs.is_required, rs.config, rs.content,
           aso.enabled AS override_enabled
    FROM agent_realms ar
    JOIN realm_skills rs ON rs.realm_id = ar.realm_id
    LEFT JOIN agent_skill_overrides aso
      ON aso.agent_did = ar.agent_did AND aso.realm_skill_id = rs.id
    WHERE ar.agent_did = ?
    GROUP BY rs.name
    ORDER BY rs.is_required DESC, rs.name ASC
  `).all(agentDid) as Array<{
    id: string;
    name: string;
    is_required: number;
    config: string;
    content: string | null;
    override_enabled: number | null;
  }>;

  // Deduplicate by name — required wins, then first realm wins
  const seen = new Map<string, import("@vaultysclaw/shared").SkillConfig>();
  for (const row of rows) {
    if (seen.has(row.name)) continue;
    const isRequired = row.is_required === 1;
    const enabled = isRequired
      ? true
      : (row.override_enabled === null ? true : row.override_enabled === 1);
    seen.set(row.name, {
      name: row.name,
      enabled,
      isRequired,
      config: JSON.parse(row.config || "{}"),
      content: row.content ?? undefined,
    });
  }
  return Array.from(seen.values());
}

// ---- Model Registry ----

export interface ModelRegistryRow {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  model_id: string;
  base_url: string;
  api_key_enc: string | null;
  litellm_model_name: string | null;
  status: "active" | "inactive";
  metadata: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function createModelRegistryEntry(entry: {
  name: string;
  description?: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  apiKeyEnc?: string;
  createdBy?: string;
}): ModelRegistryRow {
  const d = getDb();
  const id = crypto.randomUUID();
  const litellmName = `${entry.provider}/${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  d.prepare(`
    INSERT INTO model_registry (id, name, description, provider, model_id, base_url, api_key_enc, litellm_model_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.name,
    entry.description ?? null,
    entry.provider,
    entry.modelId,
    entry.baseUrl,
    entry.apiKeyEnc ?? null,
    litellmName,
    entry.createdBy ?? null,
  );
  return d.prepare("SELECT * FROM model_registry WHERE id = ?").get(id) as ModelRegistryRow;
}

export function getModelRegistryEntry(id: string): ModelRegistryRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM model_registry WHERE id = ?").get(id) as ModelRegistryRow | undefined;
}

export function getAllModelRegistryEntries(): ModelRegistryRow[] {
  const d = getDb();
  return d.prepare("SELECT * FROM model_registry ORDER BY created_at DESC").all() as ModelRegistryRow[];
}

export function getModelsByRealm(realmId: string): ModelRegistryRow[] {
  const d = getDb();
  return d.prepare(`
    SELECT m.* FROM model_registry m
    JOIN model_realm_access mra ON mra.model_id = m.id
    WHERE mra.realm_id = ? AND m.status = 'active'
    ORDER BY m.name ASC
  `).all(realmId) as ModelRegistryRow[];
}

export function updateModelRegistryEntry(
  id: string,
  updates: Partial<{
    name: string;
    description: string | null;
    provider: string;
    modelId: string;
    baseUrl: string;
    apiKeyEnc: string | null;
    status: "active" | "inactive";
    litellmModelName: string | null;
    metadata: string;
  }>
): void {
  const d = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  if (updates.name !== undefined) { sets.push("name = ?"); values.push(updates.name); }
  if (updates.description !== undefined) { sets.push("description = ?"); values.push(updates.description); }
  if (updates.provider !== undefined) { sets.push("provider = ?"); values.push(updates.provider); }
  if (updates.modelId !== undefined) { sets.push("model_id = ?"); values.push(updates.modelId); }
  if (updates.baseUrl !== undefined) { sets.push("base_url = ?"); values.push(updates.baseUrl); }
  if (updates.apiKeyEnc !== undefined) { sets.push("api_key_enc = ?"); values.push(updates.apiKeyEnc); }
  if (updates.status !== undefined) { sets.push("status = ?"); values.push(updates.status); }
  if (updates.litellmModelName !== undefined) { sets.push("litellm_model_name = ?"); values.push(updates.litellmModelName); }
  if (updates.metadata !== undefined) { sets.push("metadata = ?"); values.push(updates.metadata); }

  values.push(id);
  d.prepare(`UPDATE model_registry SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteModelRegistryEntry(id: string): void {
  const d = getDb();
  d.prepare("DELETE FROM model_registry WHERE id = ?").run(id);
}

// -- model_realm_access --

export function getModelRealmAccess(modelId: string): { realm_id: string; granted_at: string }[] {
  const d = getDb();
  return d.prepare("SELECT realm_id, granted_at FROM model_realm_access WHERE model_id = ?").all(modelId) as { realm_id: string; granted_at: string }[];
}

export function grantModelRealmAccess(modelId: string, realmId: string): void {
  const d = getDb();
  d.prepare("INSERT OR IGNORE INTO model_realm_access (model_id, realm_id) VALUES (?, ?)").run(modelId, realmId);
}

export function revokeModelRealmAccess(modelId: string, realmId: string): void {
  const d = getDb();
  d.prepare("DELETE FROM model_realm_access WHERE model_id = ? AND realm_id = ?").run(modelId, realmId);
}

// -- realm_router_keys --

export interface RealmRouterKeyRow {
  realm_id: string;
  litellm_virtual_key: string | null;
  allowed_model_ids: string;
  monthly_budget_usd: number | null;
  updated_at: string;
}

export function getRealmRouterKey(realmId: string): RealmRouterKeyRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM realm_router_keys WHERE realm_id = ?").get(realmId) as RealmRouterKeyRow | undefined;
}

export function upsertRealmRouterKey(
  realmId: string,
  data: { litellmVirtualKey?: string; allowedModelIds?: string[]; monthlyBudgetUsd?: number | null }
): void {
  const d = getDb();
  const existing = getRealmRouterKey(realmId);
  if (!existing) {
    d.prepare(`
      INSERT INTO realm_router_keys (realm_id, litellm_virtual_key, allowed_model_ids, monthly_budget_usd)
      VALUES (?, ?, ?, ?)
    `).run(
      realmId,
      data.litellmVirtualKey ?? null,
      JSON.stringify(data.allowedModelIds ?? []),
      data.monthlyBudgetUsd ?? null,
    );
  } else {
    const sets: string[] = ["updated_at = datetime('now')"];
    const values: unknown[] = [];
    if (data.litellmVirtualKey !== undefined) { sets.push("litellm_virtual_key = ?"); values.push(data.litellmVirtualKey); }
    if (data.allowedModelIds !== undefined) { sets.push("allowed_model_ids = ?"); values.push(JSON.stringify(data.allowedModelIds)); }
    if (data.monthlyBudgetUsd !== undefined) { sets.push("monthly_budget_usd = ?"); values.push(data.monthlyBudgetUsd); }
    values.push(realmId);
    d.prepare(`UPDATE realm_router_keys SET ${sets.join(", ")} WHERE realm_id = ?`).run(...values);
  }
}

// ── Governance: Policies ───────────────────────────────────────────────────

export function createPolicy(policy: {
  agentDid?: string;
  realmId?: string;
  capabilities: string[];
  resourceLimits?: { maxTokensPerDay?: number; maxRequestsPerHour?: number; allowedDomains?: string[] };
  expiresAt?: string;
  createdBy?: string;
}): PolicyRow {
  const d = getDb();
  const id = `policy-${crypto.randomUUID()}`;
  d.prepare(`
    INSERT INTO policies (id, agent_did, realm_id, capabilities, resource_limits, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    policy.agentDid ?? null,
    policy.realmId ?? null,
    JSON.stringify(policy.capabilities),
    policy.resourceLimits ? JSON.stringify(policy.resourceLimits) : null,
    policy.expiresAt ?? null,
    policy.createdBy ?? null,
  );
  return d.prepare("SELECT * FROM policies WHERE id = ?").get(id) as PolicyRow;
}

export function listPolicies(opts: { agentDid?: string; realmId?: string; includeExpired?: boolean } = {}): PolicyRow[] {
  const d = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (opts.agentDid !== undefined) { conditions.push("agent_did = ?"); values.push(opts.agentDid); }
  if (opts.realmId !== undefined) { conditions.push("realm_id = ?"); values.push(opts.realmId); }
  if (!opts.includeExpired) {
    // Use datetime(expires_at) so SQLite parses ISO 8601 strings (which contain 'T'
    // and 'Z') correctly before comparing — a raw string compare would always treat
    // ISO dates as greater than datetime('now') because 'T' > ' ' in ASCII.
    conditions.push("(expires_at IS NULL OR datetime(expires_at) > datetime('now'))");
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return d.prepare(`SELECT * FROM policies ${where} ORDER BY created_at DESC`).all(...values) as PolicyRow[];
}

export function getPolicy(id: string): PolicyRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM policies WHERE id = ?").get(id) as PolicyRow | undefined;
}

export function deletePolicy(id: string): boolean {
  const d = getDb();
  const result = d.prepare("DELETE FROM policies WHERE id = ?").run(id);
  return result.changes > 0;
}

export function countPoliciesByAgent(): { agent_did: string; count: number }[] {
  const d = getDb();
  return d.prepare(`
    SELECT agent_did, COUNT(*) AS count FROM policies
    WHERE agent_did IS NOT NULL AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    GROUP BY agent_did
  `).all() as { agent_did: string; count: number }[];
}

// ── Governance: Agent budget ───────────────────────────────────────────────

export function updateAgentBudget(did: string, budgets: { tokenBudgetDaily?: number | null; tokenBudgetMonthly?: number | null }): void {
  const d = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  if ("tokenBudgetDaily" in budgets) { sets.push("token_budget_daily = ?"); values.push(budgets.tokenBudgetDaily ?? null); }
  if ("tokenBudgetMonthly" in budgets) { sets.push("token_budget_monthly = ?"); values.push(budgets.tokenBudgetMonthly ?? null); }
  if (sets.length === 0) return;
  values.push(did);
  d.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE did = ?`).run(...values);
}
