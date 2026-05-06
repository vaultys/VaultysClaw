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
  migrateSchema(db);
  ensureServerIdentity(db);

  globalForDB.__db = db;
  return db;
}

/** Add new columns to existing tables without dropping data */
function migrateSchema(db: Database.Database): void {
  const existingCols = (db.pragma("table_info(users)") as { name: string }[]).map((c) => c.name);
  if (!existingCols.includes("name")) {
    db.exec("ALTER TABLE users ADD COLUMN name TEXT");
  }
  if (!existingCols.includes("email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }
  if (!existingCols.includes("is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingCols.includes("role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  }
  if (!existingCols.includes("reports_to")) {
    db.exec("ALTER TABLE users ADD COLUMN reports_to TEXT REFERENCES users(did) ON DELETE SET NULL");
  }

  // Migrate pending_registrations table
  const regCols = (db.pragma("table_info(pending_registrations)") as { name: string }[]).map((c) => c.name);
  if (!regCols.includes("requested_capabilities")) {
    db.exec("ALTER TABLE pending_registrations ADD COLUMN requested_capabilities TEXT NOT NULL DEFAULT '[]'");
  }

  // Migrate agents table
  const agentCols = (db.pragma("table_info(agents)") as { name: string }[]).map((c) => c.name);
  if (!agentCols.includes("llm_config")) {
    db.exec("ALTER TABLE agents ADD COLUMN llm_config TEXT DEFAULT NULL");
  }

  // Ensure realm tables exist (idempotent via CREATE TABLE IF NOT EXISTS)
  ensureRealmTables(db);

  // Seed the default realm if none exists
  const realmCount = (db.prepare("SELECT COUNT(*) AS n FROM realms").get() as { n: number }).n;
  if (realmCount === 0) {
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO realms (id, name, slug, description, color, is_default) VALUES (?, ?, ?, ?, ?, 1)"
    ).run(id, "Default", "default", "The default realm", "#6366f1");
  }
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      did TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      public_key TEXT,
      capabilities TEXT NOT NULL DEFAULT '[]',
      certificate_data TEXT,
      llm_config TEXT DEFAULT NULL,
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
      did TEXT PRIMARY KEY,
      public_key TEXT,
      name TEXT,
      email TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'member',
      reports_to TEXT REFERENCES users(did) ON DELETE SET NULL,
      registered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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
  `);
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

function ensureRealmTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS realms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#6366f1',
      is_default INTEGER NOT NULL DEFAULT 0,
      llm_config TEXT DEFAULT NULL,
      default_capabilities TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_realms (
      agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_did, realm_id)
    );

    CREATE TABLE IF NOT EXISTS user_realms (
      user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_did, realm_id)
    );
  `);
}

export interface RealmRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_default: number;
  llm_config: string | null;
  default_capabilities: string;
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
  updates: Partial<Pick<RealmRow, "name" | "slug" | "description" | "color" | "llm_config" | "default_capabilities">>
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

export function getUserRealms(userDid: string): RealmMembershipRow[] {
  const d = getDb();
  return d.prepare(`
    SELECT r.id AS realm_id, r.name, r.slug, r.color, r.is_default,
           ur.is_primary, ur.joined_at
    FROM user_realms ur
    JOIN realms r ON r.id = ur.realm_id
    WHERE ur.user_did = ?
    ORDER BY ur.is_primary DESC, r.name ASC
  `).all(userDid) as RealmMembershipRow[];
}

export function addUserToRealm(userDid: string, realmId: string, isPrimary = false): void {
  const d = getDb();
  if (isPrimary) {
    d.prepare("UPDATE user_realms SET is_primary = 0 WHERE user_did = ?").run(userDid);
  }
  d.prepare(
    "INSERT OR REPLACE INTO user_realms (user_did, realm_id, is_primary) VALUES (?, ?, ?)"
  ).run(userDid, realmId, isPrimary ? 1 : 0);
}

export function removeUserFromRealm(userDid: string, realmId: string): boolean {
  const d = getDb();
  const realm = getRealmById(realmId);
  if (realm?.is_default) return false;
  const result = d.prepare("DELETE FROM user_realms WHERE user_did = ? AND realm_id = ?").run(userDid, realmId);
  return result.changes > 0;
}

export function getRealmUsers(realmId: string): { user_did: string; name: string | null; email: string | null; is_primary: number; joined_at: string }[] {
  const d = getDb();
  return d.prepare(`
    SELECT u.did AS user_did, u.name, u.email, ur.is_primary, ur.joined_at
    FROM user_realms ur
    JOIN users u ON u.did = ur.user_did
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
