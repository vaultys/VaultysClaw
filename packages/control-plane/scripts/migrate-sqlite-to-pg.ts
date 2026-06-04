/**
 * Migrate selected tables from SQLite to PostgreSQL.
 * Migrates: settings, model_registry, agents, users (with self-ref reports_to).
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-sqlite-to-pg.ts [path/to/vaultysclaw.db]
 *
 * DATABASE_URL is read from .env (or environment).
 */

import Database from "better-sqlite3";
import pg from "pg";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });
config({ path: path.resolve(__dirname, "../.env.local") });

const SQLITE_PATH =
  process.argv[2] ??
  path.resolve(__dirname, "../data/vaultysclaw.db");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// pg sends JS arrays as PG arrays, not JSONB — always pass pre-serialized strings
function json(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  try {
    JSON.parse(value); // validate
    return value;
  } catch {
    return null;
  }
}

function jsonOrDefault(value: string | null | undefined, def: unknown): string {
  if (value == null || value === "") return JSON.stringify(def);
  try {
    JSON.parse(value); // validate
    return value;
  } catch {
    return JSON.stringify(def);
  }
}

function bool(value: number | null | undefined): boolean {
  return value === 1;
}

function ts(value: string | null | undefined): string | null {
  if (!value) return null;
  // SQLite stores as "YYYY-MM-DD HH:MM:SS" — append Z so PG treats it as UTC
  return value.includes("T") ? value : value.replace(" ", "T") + "Z";
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── settings ──────────────────────────────────────────────────────────────
    console.log("Migrating settings…");
    const settings = sqlite.prepare("SELECT key, value FROM settings").all() as Array<{key: string; value: string}>;
    for (const row of settings) {
      await client.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [row.key, row.value]
      );
    }
    console.log(`  ${settings.length} rows`);

    // ── model_registry ────────────────────────────────────────────────────────
    console.log("Migrating model_registry…");
    const models = sqlite
      .prepare("SELECT * FROM model_registry")
      .all() as any[];
    for (const r of models) {
      await client.query(
        `INSERT INTO model_registry
           (id, name, description, provider, model_id, base_url, api_key_enc,
            litellm_model_name, status, metadata, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.name, r.description, r.provider, r.model_id, r.base_url,
          r.api_key_enc, r.litellm_model_name, r.status ?? "active",
          jsonOrDefault(r.metadata, {}),
          r.created_by, ts(r.created_at), ts(r.updated_at),
        ]
      );
    }
    console.log(`  ${models.length} rows`);

    // ── agents ────────────────────────────────────────────────────────────────
    console.log("Migrating agents…");
    const agents = sqlite.prepare("SELECT * FROM agents").all() as any[];
    for (const r of agents) {
      await client.query(
        `INSERT INTO agents
           (did, name, public_key, capabilities, certificate_data, llm_config,
            token_budget_daily, token_budget_monthly, registered_at, last_seen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (did) DO NOTHING`,
        [
          r.did, r.name, r.public_key,
          jsonOrDefault(r.capabilities, []),
          r.certificate_data,
          json(r.llm_config),
          r.token_budget_daily, r.token_budget_monthly,
          ts(r.registered_at), ts(r.last_seen),
        ]
      );
    }
    console.log(`  ${agents.length} rows`);

    // ── users (pass 1: insert with reports_to = null) ─────────────────────────
    console.log("Migrating users (pass 1)…");
    const users = sqlite.prepare("SELECT * FROM users").all() as any[];
    for (const r of users) {
      await client.query(
        `INSERT INTO users
           (id, did, public_key, name, email, is_owner, is_admin, role,
            reports_to, description, entra_id, claimed_at, registered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.did, r.public_key, r.name, r.email,
          bool(r.is_owner), bool(r.is_admin), r.role ?? "member",
          r.description, r.entra_id,
          ts(r.claimed_at), ts(r.registered_at),
        ]
      );
    }
    console.log(`  ${users.length} rows`);

    // ── users (pass 2: restore reports_to self-references) ────────────────────
    console.log("Migrating users (pass 2: reports_to)…");
    const withReportsTo = users.filter((r) => r.reports_to != null);
    for (const r of withReportsTo) {
      await client.query(
        `UPDATE users SET reports_to = $1 WHERE id = $2`,
        [r.reports_to, r.id]
      );
    }
    console.log(`  ${withReportsTo.length} self-references restored`);

    await client.query("COMMIT");
    console.log("\nMigration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

run();
