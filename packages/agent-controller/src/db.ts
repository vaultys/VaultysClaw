/**
 * Agent Controller SQLite database
 * Stores certificates and agent state locally
 */

import { Database } from "./bun-sqlite-shim";
import path from "path";
import fs from "fs";
import type { LlmConfig } from "@vaultysclaw/shared";

let db: Database | null = null;

/**
 * Initialize the agent's local database
 * @param dbDir - directory where the DB file will be stored (same as vaultysId dir)
 */
export function initDb(dbDir: string, dbFileName = "agent.db"): Database {
  if (db) return db;

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, dbFileName);
  db = new Database(dbPath);

  db.exec("PRAGMA journal_mode=WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      result TEXT,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC, scheduled_at);

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron TEXT NOT NULL,
      action TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      importance REAL NOT NULL DEFAULT 0.5,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
      USING fts5(id UNINDEXED, content, tags, content='memories', content_rowid='rowid');

    CREATE TABLE IF NOT EXISTS tool_usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '{}',
      success INTEGER NOT NULL DEFAULT 1,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON tool_usage_log(tool_name, created_at DESC);

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_data TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      agent_did TEXT,
      server_did TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS delegations (
      id TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL,
      user_did TEXT NOT NULL,
      agent_did TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      certificate TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS web_sessions (
      token TEXT PRIMARY KEY,
      did TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      thinking TEXT,
      tool_calls TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id ASC);

    CREATE TABLE IF NOT EXISTS peer_grants (
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

    CREATE INDEX IF NOT EXISTS idx_peer_grants_source ON peer_grants(source_did);
    CREATE INDEX IF NOT EXISTS idx_peer_grants_target ON peer_grants(target_did);

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at DESC);

    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'idle',
      doc_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
      doc_id TEXT NOT NULL,
      doc_title TEXT,
      content TEXT NOT NULL,
      embedding BLOB NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_id);
  `);

  // Migrations for DBs created before a column was added. SQLite has no
  // "ADD COLUMN IF NOT EXISTS", so check PRAGMA table_info first.
  ensureColumn(db, "chat_messages", "thinking", "TEXT");

  return db;
}

/** Idempotently add a column to a table if it doesn't already exist. */
function ensureColumn(
  database: Database,
  table: string,
  column: string,
  type: string
): void {
  const cols = database
    .query<{ name: string }>(`PRAGMA table_info(${table})`)
    .all();
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function getDb(): Database {
  if (!db)
    throw new Error("Agent database not initialized — call initDb() first");
  return db;
}

/**
 * Store a new certificate
 */
export function storeCertificate(
  certificateData: string,
  capabilities: string[],
  agentDid?: string,
  serverDid?: string
): void {
  const d = getDb();
  d.query(
    `
    INSERT INTO certificates (certificate_data, capabilities, agent_did, server_did)
    VALUES ($certificateData, $capabilities, $agentDid, $serverDid)
  `
  ).run({
    $certificateData: certificateData,
    $capabilities: JSON.stringify(capabilities),
    $agentDid: agentDid ?? null,
    $serverDid: serverDid ?? null,
  });
}

/**
 * Get the latest certificate
 */
export function getLatestCertificate():
  | {
      certificate_data: string;
      capabilities: string;
      agent_did: string | null;
      server_did: string | null;
      created_at: string;
    }
  | undefined {
  const d = getDb();
  return d
    .query("SELECT * FROM certificates ORDER BY id DESC LIMIT 1")
    .get() as any;
}

/**
 * Get/set simple key-value state
 */
export function getState(key: string): string | undefined {
  const d = getDb();
  const row = d
    .query("SELECT value FROM state WHERE key = $key")
    .get({ $key: key }) as { value: string } | undefined;
  return row?.value;
}

export function setState(key: string, value: string): void {
  const d = getDb();
  d.query(
    "INSERT OR REPLACE INTO state (key, value) VALUES ($key, $value)"
  ).run({ $key: key, $value: value });
}

// ---------------------------------------------------------------------------
// Web sessions (persisted across restarts)
// ---------------------------------------------------------------------------

export function upsertWebSession(
  token: string,
  did: string,
  createdAt: number
): void {
  const d = getDb();
  d.query(
    "INSERT OR REPLACE INTO web_sessions (token, did, created_at) VALUES ($token, $did, $createdAt)"
  ).run({ $token: token, $did: did, $createdAt: createdAt });
}

export function getWebSessionByToken(
  token: string
): { token: string; did: string; created_at: number } | undefined {
  const d = getDb();
  return d
    .query("SELECT * FROM web_sessions WHERE token = $token")
    .get({ $token: token }) as any;
}

export function deleteWebSession(token: string): void {
  const d = getDb();
  d.query("DELETE FROM web_sessions WHERE token = $token").run({
    $token: token,
  });
}

export function deleteExpiredWebSessions(maxAgeMs: number): void {
  const d = getDb();
  const cutoff = Date.now() - maxAgeMs;
  d.query("DELETE FROM web_sessions WHERE created_at < $cutoff").run({
    $cutoff: cutoff,
  });
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// --- Delegation helpers ---

export interface DelegationRow {
  id: string;
  grant_id: string;
  user_did: string;
  agent_did: string;
  capabilities: string; // JSON
  certificate: string;
  expires_at: string | null;
  created_at: string;
}

export function storeDelegation(d: Omit<DelegationRow, "created_at">): void {
  const db = getDb();
  db.query(
    `
    INSERT OR REPLACE INTO delegations
      (id, grant_id, user_did, agent_did, capabilities, certificate, expires_at)
    VALUES ($id, $grant_id, $user_did, $agent_did, $capabilities, $certificate, $expires_at)
  `
  ).run({
    $id: d.id,
    $grant_id: d.grant_id,
    $user_did: d.user_did,
    $agent_did: d.agent_did,
    $capabilities: d.capabilities,
    $certificate: d.certificate,
    $expires_at: d.expires_at ?? null,
  });
}

export function clearDelegationsForUser(userDid: string): void {
  const db = getDb();
  db.query("DELETE FROM delegations WHERE user_did = $user_did").run({
    $user_did: userDid,
  });
}

export function clearAllDelegations(): void {
  const db = getDb();
  db.query("DELETE FROM delegations").run();
}

export function getDelegationsForUser(userDid: string): DelegationRow[] {
  const db = getDb();
  return db
    .query("SELECT * FROM delegations WHERE user_did = $user_did")
    .all({ $user_did: userDid }) as DelegationRow[];
}

export function getAllDelegations(): DelegationRow[] {
  const db = getDb();
  return db.query("SELECT * FROM delegations").all() as DelegationRow[];
}

// --- LLM config helpers (stored in the state k/v table) ---

const LLM_CONFIG_KEY = "llm_config";
// Stores the LLM config JSON with the apiKey field replaced by an encrypted blob.
// The encryption is performed by the Agent class (which holds the VaultysId).
const ENCRYPTED_LLM_CONFIG_KEY = "llm_config_encrypted";

/**
 * Retrieve the remote LLM config pushed by the control plane.
 * Returns null if not set or if the stored value is malformed.
 * NOTE: apiKey is NOT decrypted here — use Agent.refreshActiveLlmConfig() which
 * performs decryption with the live VaultysId instance.
 */
export function getLlmConfig(): LlmConfig | null {
  try {
    const raw = getState(LLM_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LlmConfig;
  } catch {
    return null;
  }
}

/**
 * Persist (or clear) the remote LLM config in the local state table.
 * Pass null to clear — agent will fall back to env-var config.
 */
export function setLlmConfig(config: LlmConfig | null): void {
  if (config === null) {
    const d = getDb();
    d.query("DELETE FROM state WHERE key = $key").run({ $key: LLM_CONFIG_KEY });
    d.query("DELETE FROM state WHERE key = $key").run({
      $key: ENCRYPTED_LLM_CONFIG_KEY,
    });
  } else {
    setState(LLM_CONFIG_KEY, JSON.stringify(config));
  }
}

/**
 * Store an encrypted LLM config blob. The JSON contains all LlmConfig fields
 * plus `encryptedApiKey` (VaultysId-encrypted ciphertext) and `apiKeyEncrypted: true`.
 * Only the Agent (which owns the VaultysId) can decrypt it.
 */
export function setEncryptedLlmConfigBlob(json: string): void {
  setState(ENCRYPTED_LLM_CONFIG_KEY, json);
}

/**
 * Retrieve the raw encrypted LLM config blob for decryption by the Agent.
 * Returns null if no encrypted config has been stored.
 */
export function getEncryptedLlmConfigBlob(): string | null {
  return getState(ENCRYPTED_LLM_CONFIG_KEY) ?? null;
}

// --- PeerJS server config (configurable by control plane) ---

/**
 * Retrieve the PeerJS relay server URL override.
 * Returns null to use the default public PeerJS relay.
 */
export function getPeerjsServer(): string | null {
  return getState("peerjs_server") ?? null;
}

/**
 * Persist a custom PeerJS relay server URL.
 * Pass null to revert to the default public relay.
 */
export function setPeerjsServer(url: string | null): void {
  if (url === null) {
    getDb()
      .query("DELETE FROM state WHERE key = $key")
      .run({ $key: "peerjs_server" });
  } else {
    setState("peerjs_server", url);
  }
}

// --- Peer grant helpers ---

export interface PeerGrantRow {
  id: string;
  source_did: string;
  target_did: string;
  target_name: string;
  skill_description: string;
  capabilities: string; // JSON array
  certificate: string;
  expires_at: string | null;
  created_at: string;
}

/**
 * Replace the full peer grant list (as pushed by the control plane).
 * All existing rows for this agent are deleted first.
 */
export function storePeerGrants(
  sourceDid: string,
  grants: PeerGrantRow[]
): void {
  const db = getDb();
  db.query("DELETE FROM peer_grants WHERE source_did = $source_did").run({
    $source_did: sourceDid,
  });
  for (const g of grants) {
    db.query(
      `
      INSERT OR REPLACE INTO peer_grants
        (id, source_did, target_did, target_name, skill_description, capabilities, certificate, expires_at)
      VALUES ($id, $source_did, $target_did, $target_name, $skill_description, $capabilities, $certificate, $expires_at)
    `
    ).run({
      $id: g.id,
      $source_did: g.source_did,
      $target_did: g.target_did,
      $target_name: g.target_name,
      $skill_description: g.skill_description,
      $capabilities: g.capabilities,
      $certificate: g.certificate,
      $expires_at: g.expires_at ?? null,
    });
  }
}

export function getAllPeerGrants(): PeerGrantRow[] {
  return getDb().query("SELECT * FROM peer_grants").all() as PeerGrantRow[];
}

export function clearAllPeerGrants(): void {
  getDb().query("DELETE FROM peer_grants").run();
}

// ---- Task queue helpers ----

export type TaskStatus = "pending" | "running" | "success" | "failed" | "dead";

export interface TaskRow {
  id: string;
  action: string;
  params: string; // JSON
  status: TaskStatus;
  priority: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: string | null; // JSON
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_by: string | null;
  created_at: string;
}

export function insertTask(task: Omit<TaskRow, "created_at">): void {
  getDb()
    .query(
      `
    INSERT INTO tasks
      (id, action, params, status, priority, scheduled_at, max_retries, created_by)
    VALUES ($id, $action, $params, $status, $priority, $scheduled_at, $max_retries, $created_by)
  `
    )
    .run({
      $id: task.id,
      $action: task.action,
      $params: task.params,
      $status: task.status,
      $priority: task.priority,
      $scheduled_at: task.scheduled_at ?? null,
      $max_retries: task.max_retries,
      $created_by: task.created_by ?? null,
    });
}

export function getNextPendingTask(): TaskRow | undefined {
  return getDb()
    .query(
      `
    SELECT * FROM tasks
    WHERE status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `
    )
    .get() as TaskRow | undefined;
}

export function setTaskRunning(id: string): void {
  getDb()
    .query(
      `
    UPDATE tasks SET status = 'running', started_at = datetime('now') WHERE id = $id
  `
    )
    .run({ $id: id });
}

export function setTaskCompleted(id: string, result: unknown): void {
  getDb()
    .query(
      `
    UPDATE tasks SET status = 'success', completed_at = datetime('now'), result = $result WHERE id = $id
  `
    )
    .run({ $id: id, $result: JSON.stringify(result) });
}

export function setTaskFailed(id: string, error: string): void {
  getDb()
    .query(
      `
    UPDATE tasks
    SET status = CASE WHEN retry_count + 1 >= max_retries THEN 'dead' ELSE 'failed' END,
        completed_at = datetime('now'),
        error = $error
    WHERE id = $id
  `
    )
    .run({ $id: id, $error: error });
}

export function requeueFailedTask(id: string, delayMs: number): void {
  const scheduledAt = new Date(Date.now() + delayMs)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  getDb()
    .query(
      `
    UPDATE tasks
    SET status = 'pending', started_at = NULL, retry_count = retry_count + 1, scheduled_at = $scheduled_at
    WHERE id = $id
  `
    )
    .run({ $id: id, $scheduled_at: scheduledAt });
}

export function getTaskById(id: string): TaskRow | undefined {
  return getDb()
    .query("SELECT * FROM tasks WHERE id = $id")
    .get({ $id: id }) as TaskRow | undefined;
}

export function getRecentTasks(limit = 50): TaskRow[] {
  return getDb()
    .query("SELECT * FROM tasks ORDER BY created_at DESC LIMIT $limit")
    .all({ $limit: limit }) as TaskRow[];
}

// ---- Schedule helpers ----

export interface ScheduleRow {
  id: string;
  name: string;
  cron: string;
  action: string;
  params: string; // JSON
  enabled: number; // 0 or 1
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

export function upsertSchedule(s: Omit<ScheduleRow, "created_at">): void {
  getDb()
    .query(
      `
    INSERT OR REPLACE INTO schedules (id, name, cron, action, params, enabled, last_run, next_run)
    VALUES ($id, $name, $cron, $action, $params, $enabled, $last_run, $next_run)
  `
    )
    .run({
      $id: s.id,
      $name: s.name,
      $cron: s.cron,
      $action: s.action,
      $params: s.params,
      $enabled: s.enabled,
      $last_run: s.last_run ?? null,
      $next_run: s.next_run ?? null,
    });
}

export function getActiveSchedules(): ScheduleRow[] {
  return getDb()
    .query("SELECT * FROM schedules WHERE enabled = 1")
    .all() as ScheduleRow[];
}

export function updateScheduleLastRun(
  id: string,
  nextRun: string | null
): void {
  getDb()
    .query(
      `
    UPDATE schedules SET last_run = datetime('now'), next_run = $next_run WHERE id = $id
  `
    )
    .run({ $id: id, $next_run: nextRun });
}

export function deleteSchedule(id: string): void {
  getDb().query("DELETE FROM schedules WHERE id = $id").run({ $id: id });
}

// ---- Memory helpers ----

export type MemoryType =
  | "fact"
  | "procedure"
  | "preference"
  | "conversation_summary";

export interface MemoryRow {
  id: string;
  type: MemoryType;
  content: string;
  tags: string; // JSON array
  importance: number; // 0.0 – 1.0
  access_count: number;
  last_accessed: string | null;
  created_at: string;
}

export function insertMemory(
  m: Omit<MemoryRow, "created_at" | "access_count" | "last_accessed">
): void {
  const db = getDb();
  db.query(
    `
    INSERT OR REPLACE INTO memories (id, type, content, tags, importance)
    VALUES ($id, $type, $content, $tags, $importance)
  `
  ).run({
    $id: m.id,
    $type: m.type,
    $content: m.content,
    $tags: m.tags,
    $importance: m.importance,
  });
  // Sync FTS index
  db.query(
    `INSERT INTO memories_fts(id, content, tags) VALUES ($id, $content, $tags)`
  ).run({
    $id: m.id,
    $content: m.content,
    $tags: m.tags,
  });
}

export function searchMemories(query: string, limit = 10): MemoryRow[] {
  return getDb()
    .query(
      `
    SELECT m.* FROM memories m
    JOIN memories_fts ON memories_fts.id = m.id
    WHERE memories_fts MATCH $query
    ORDER BY rank, m.importance DESC
    LIMIT $limit
  `
    )
    .all({ $query: query, $limit: limit }) as MemoryRow[];
}

export function getRecentMemories(type?: MemoryType, limit = 20): MemoryRow[] {
  if (type) {
    return getDb()
      .query(
        "SELECT * FROM memories WHERE type = $type ORDER BY created_at DESC LIMIT $limit"
      )
      .all({ $type: type, $limit: limit }) as MemoryRow[];
  }
  return getDb()
    .query("SELECT * FROM memories ORDER BY created_at DESC LIMIT $limit")
    .all({ $limit: limit }) as MemoryRow[];
}

export function touchMemory(id: string): void {
  getDb()
    .query(
      `
    UPDATE memories SET access_count = access_count + 1, last_accessed = datetime('now') WHERE id = $id
  `
    )
    .run({ $id: id });
}

export function deleteMemory(id: string): void {
  const db = getDb();
  db.query("DELETE FROM memories WHERE id = $id").run({ $id: id });
  db.query("DELETE FROM memories_fts WHERE id = $id").run({ $id: id });
}

// ---- Chat sessions ----

export interface ChatSessionRow {
  id: string;
  title: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  thinking: string | null;
  tool_calls: string | null;
  created_at: string;
}

export function upsertChatSession(
  id: string,
  title: string | null,
  source: string
): void {
  getDb()
    .query(
      `
    INSERT INTO chat_sessions (id, title, source)
    VALUES ($id, $title, $source)
    ON CONFLICT(id) DO UPDATE SET
      title = COALESCE($title, title),
      updated_at = datetime('now')
  `
    )
    .run({ $id: id, $title: title ?? null, $source: source });
}

export function touchChatSession(id: string): void {
  getDb()
    .query(
      `UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = $id`
    )
    .run({ $id: id });
}

export function appendChatMessages(
  sessionId: string,
  msgs: Array<{
    role: string;
    content: string;
    thinking?: string;
    toolCalls?: unknown;
  }>
): void {
  const db = getDb();
  const stmt = db.query(`
    INSERT INTO chat_messages (session_id, role, content, thinking, tool_calls)
    VALUES ($session_id, $role, $content, $thinking, $tool_calls)
  `);
  for (const m of msgs) {
    stmt.run({
      $session_id: sessionId,
      $role: m.role,
      $content: m.content,
      $thinking: m.thinking ?? null,
      $tool_calls: m.toolCalls != null ? JSON.stringify(m.toolCalls) : null,
    });
  }
  touchChatSession(sessionId);
}

export function listChatSessions(limit = 50): ChatSessionRow[] {
  return getDb()
    .query(
      `
    SELECT s.*, COUNT(m.id) AS message_count
    FROM chat_sessions s
    LEFT JOIN chat_messages m ON m.session_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    LIMIT $limit
  `
    )
    .all({ $limit: limit }) as ChatSessionRow[];
}

export function getChatSession(id: string): ChatSessionRow | undefined {
  return getDb()
    .query(`SELECT * FROM chat_sessions WHERE id = $id`)
    .get({ $id: id }) as ChatSessionRow | undefined;
}

export function getChatMessages(sessionId: string): ChatMessageRow[] {
  return getDb()
    .query(
      `
    SELECT * FROM chat_messages WHERE session_id = $session_id ORDER BY id ASC
  `
    )
    .all({ $session_id: sessionId }) as ChatMessageRow[];
}

export function deleteChatSession(id: string): void {
  getDb().query(`DELETE FROM chat_sessions WHERE id = $id`).run({ $id: id });
}

// ---- Tool usage log ----

export function logToolUsage(
  toolName: string,
  args: unknown,
  success: boolean,
  durationMs: number
): void {
  getDb()
    .query(
      `
    INSERT INTO tool_usage_log (tool_name, args, success, duration_ms)
    VALUES ($tool_name, $args, $success, $duration_ms)
  `
    )
    .run({
      $tool_name: toolName,
      $args: JSON.stringify(args),
      $success: success ? 1 : 0,
      $duration_ms: durationMs,
    });
}

// ---- Token usage tracking ----

export interface TokenUsageRow {
  id: number;
  prompt_tokens: number;
  completion_tokens: number;
  provider: string;
  model: string;
  created_at: string;
}

export function recordTokenUsage(
  promptTokens: number,
  completionTokens: number,
  provider: string,
  model: string
): void {
  getDb()
    .query(
      `
    INSERT INTO token_usage (prompt_tokens, completion_tokens, provider, model)
    VALUES ($prompt_tokens, $completion_tokens, $provider, $model)
  `
    )
    .run({
      $prompt_tokens: promptTokens,
      $completion_tokens: completionTokens,
      $provider: provider,
      $model: model,
    });
}

export function getTotalTokenUsage(): {
  promptTokens: number;
  completionTokens: number;
} {
  const result = getDb()
    .query(
      `
    SELECT
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens
    FROM token_usage
  `
    )
    .get() as { prompt_tokens: number; completion_tokens: number } | undefined;
  return {
    promptTokens: result?.prompt_tokens ?? 0,
    completionTokens: result?.completion_tokens ?? 0,
  };
}

export function getRecentTokenUsage(limit = 100): TokenUsageRow[] {
  return getDb()
    .query(
      `
    SELECT * FROM token_usage ORDER BY created_at DESC LIMIT $limit
  `
    )
    .all({ $limit: limit }) as TokenUsageRow[];
}

export function getDailyTokenUsage(): {
  promptTokens: number;
  completionTokens: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  const result = getDb()
    .query(
      `
    SELECT
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens
    FROM token_usage
    WHERE created_at >= $todayStart
  `
    )
    .get({ $todayStart: todayStart }) as
    | { prompt_tokens: number; completion_tokens: number }
    | undefined;
  return {
    promptTokens: result?.prompt_tokens ?? 0,
    completionTokens: result?.completion_tokens ?? 0,
  };
}

export function getMonthlyTokenUsage(): {
  promptTokens: number;
  completionTokens: number;
} {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStart = firstDay.toISOString();

  const result = getDb()
    .query(
      `
    SELECT
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens
    FROM token_usage
    WHERE created_at >= $monthStart
  `
    )
    .get({ $monthStart: monthStart }) as
    | { prompt_tokens: number; completion_tokens: number }
    | undefined;
  return {
    promptTokens: result?.prompt_tokens ?? 0,
    completionTokens: result?.completion_tokens ?? 0,
  };
}

// ---- Knowledge base helpers ----

export interface KnowledgeSourceRow {
  id: string;
  name: string;
  source_type: string;
  config: string; // JSON
  status: string; // idle | syncing | ready | error
  doc_count: number;
  chunk_count: number;
  last_synced_at: string | null;
  error: string | null;
  created_at: string;
}

export interface KnowledgeChunkRow {
  id: string;
  source_id: string;
  doc_id: string;
  doc_title: string | null;
  content: string;
  embedding: Buffer; // serialized Float32Array
  chunk_index: number;
  metadata: string; // JSON
  created_at: string;
}

export function upsertKnowledgeSource(
  s: Omit<KnowledgeSourceRow, "created_at">
): void {
  getDb()
    .query(
      `
    INSERT INTO knowledge_sources (id, name, source_type, config, status, doc_count, chunk_count, last_synced_at, error)
    VALUES ($id, $name, $source_type, $config, $status, $doc_count, $chunk_count, $last_synced_at, $error)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source_type = excluded.source_type,
      config = excluded.config,
      status = excluded.status,
      doc_count = excluded.doc_count,
      chunk_count = excluded.chunk_count,
      last_synced_at = excluded.last_synced_at,
      error = excluded.error
  `
    )
    .run({
      $id: s.id,
      $name: s.name,
      $source_type: s.source_type,
      $config: s.config,
      $status: s.status,
      $doc_count: s.doc_count,
      $chunk_count: s.chunk_count,
      $last_synced_at: s.last_synced_at ?? null,
      $error: s.error ?? null,
    });
}

export function updateKnowledgeSourceStatus(
  id: string,
  status: string,
  extra?: { docCount?: number; chunkCount?: number; error?: string | null }
): void {
  getDb()
    .query(
      `
    UPDATE knowledge_sources SET
      status = $status,
      doc_count = COALESCE($doc_count, doc_count),
      chunk_count = COALESCE($chunk_count, chunk_count),
      last_synced_at = CASE WHEN $status = 'ready' THEN datetime('now') ELSE last_synced_at END,
      error = $error
    WHERE id = $id
  `
    )
    .run({
      $id: id,
      $status: status,
      $doc_count: extra?.docCount ?? null,
      $chunk_count: extra?.chunkCount ?? null,
      $error: extra?.error ?? null,
    });
}

export function getKnowledgeSource(id: string): KnowledgeSourceRow | undefined {
  return getDb()
    .query("SELECT * FROM knowledge_sources WHERE id = $id")
    .get({ $id: id }) as KnowledgeSourceRow | undefined;
}

export function listKnowledgeSources(): KnowledgeSourceRow[] {
  return getDb()
    .query("SELECT * FROM knowledge_sources ORDER BY created_at DESC")
    .all() as KnowledgeSourceRow[];
}

export function deleteKnowledgeSource(id: string): void {
  getDb()
    .query("DELETE FROM knowledge_sources WHERE id = $id")
    .run({ $id: id });
}

export function insertKnowledgeChunk(
  c: Omit<KnowledgeChunkRow, "created_at">
): void {
  getDb()
    .query(
      `
    INSERT OR REPLACE INTO knowledge_chunks (id, source_id, doc_id, doc_title, content, embedding, chunk_index, metadata)
    VALUES ($id, $source_id, $doc_id, $doc_title, $content, $embedding, $chunk_index, $metadata)
  `
    )
    .run({
      $id: c.id,
      $source_id: c.source_id,
      $doc_id: c.doc_id,
      $doc_title: c.doc_title ?? null,
      $content: c.content,
      $embedding: c.embedding,
      $chunk_index: c.chunk_index,
      $metadata: c.metadata,
    });
}

export function deleteChunksBySource(sourceId: string): void {
  getDb()
    .query("DELETE FROM knowledge_chunks WHERE source_id = $source_id")
    .run({ $source_id: sourceId });
}

export function getAllChunkEmbeddings(sourceId?: string): Array<{
  id: string;
  source_id: string;
  doc_id: string;
  doc_title: string | null;
  content: string;
  embedding: Buffer;
  metadata: string;
}> {
  if (sourceId) {
    return getDb()
      .query(
        "SELECT id, source_id, doc_id, doc_title, content, embedding, metadata FROM knowledge_chunks WHERE source_id = $source_id"
      )
      .all({ $source_id: sourceId }) as any[];
  }
  return getDb()
    .query(
      "SELECT id, source_id, doc_id, doc_title, content, embedding, metadata FROM knowledge_chunks"
    )
    .all() as any[];
}
