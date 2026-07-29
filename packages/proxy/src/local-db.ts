/**
 * Local SQLite store — the proxy's only source of truth for making decisions
 * without a control-plane round trip.
 *
 * Two concerns, same file (mirrors agent-controller's single local `agent.db`):
 *   - `config`: the latest WSProxyConfigPayload pushed down, cached so the
 *     HTTP listener has rules to match against immediately on startup, before
 *     the first reconnect completes.
 *   - `provisioned_identities`: VaultysId keypairs the proxy minted itself for
 *     principals it saw with no self-signed header. Durable and never
 *     regenerated — losing this would silently strip a principal of its
 *     already-approved governance rules on next restart.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { VaultysId } from "@vaultys/id";
import type { WSProxyConfigPayload } from "@vaultysclaw/shared";

export class LocalDb {
  private db: InstanceType<typeof Database>;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provisioned_identities (
        external_id TEXT PRIMARY KEY,
        did TEXT NOT NULL UNIQUE,
        secret TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  saveConfig(payload: WSProxyConfigPayload): void {
    this.db
      .prepare(
        `INSERT INTO config (id, payload) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`
      )
      .run(JSON.stringify(payload));
  }

  loadConfig(): WSProxyConfigPayload | null {
    const row = this.db
      .prepare("SELECT payload FROM config WHERE id = 1")
      .get() as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as WSProxyConfigPayload) : null;
  }

  /** Look up (and reconstruct) the VaultysId this proxy previously minted for `externalId`. */
  getProvisionedIdentity(externalId: string): VaultysId | null {
    const row = this.db
      .prepare(
        "SELECT secret FROM provisioned_identities WHERE external_id = ?"
      )
      .get(externalId) as { secret: string } | undefined;
    if (!row) return null;
    return VaultysId.fromSecret(row.secret).toVersion(1);
  }

  /** Persist a newly-minted VaultysId for `externalId`. Never overwrites an existing row. */
  saveProvisionedIdentity(externalId: string, vid: VaultysId): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO provisioned_identities (external_id, did, secret)
         VALUES (?, ?, ?)`
      )
      .run(externalId, vid.did, vid.getSecret());
  }

  close(): void {
    this.db.close();
  }
}
