/**
 * demo/configure-services.ts
 *
 * Auto-configures MinIO (S3) and Docling in the control-plane database after
 * the services are up.  Called by demo/setup.sh once the control plane is
 * ready.
 *
 * Run from packages/control-plane so the control-plane node_modules are on
 * the module resolution path:
 *
 *   cd packages/control-plane
 *   DATABASE_URL=... VAULTYS_DB_PATH=... \
 *     tsx ../../demo/configure-services.ts \
 *       --minio-endpoint http://localhost:9000 \
 *       --minio-bucket   demo-files            \
 *       --minio-user     minioadmin            \
 *       --minio-pass     minioadmin            \
 *       --docling-url    http://localhost:5001
 */

import { VaultysId } from "@vaultys/id";
import Database from "better-sqlite3";
import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import pg from "pg";

// ── Arg parsing ───────────────────────────────────────────────────────────────

function arg(name: string, fallback?: string): string {
  const idx = process.argv.indexOf(name);
  const val = idx !== -1 ? process.argv[idx + 1] : undefined;
  if (val !== undefined && val !== "") return val;
  if (fallback !== undefined) return fallback;
  console.error(`[configure-services] Missing required argument: ${name}`);
  process.exit(1);
}

const minioEndpoint = arg("--minio-endpoint", "http://localhost:9000");
const minioBucket   = arg("--minio-bucket",   "demo-files");
const minioUser     = arg("--minio-user",      "minioadmin");
const minioPass     = arg("--minio-pass",      "minioadmin");
const doclingUrl    = arg("--docling-url",     "http://localhost:5001");
const skipDocling   = process.argv.includes("--skip-docling");
const skipMinio     = process.argv.includes("--skip-minio");

// ── Validate env ──────────────────────────────────────────────────────────────

const DATABASE_URL   = process.env.DATABASE_URL;
const VAULTYS_DB_PATH = process.env.VAULTYS_DB_PATH;

if (!DATABASE_URL) {
  console.error("[configure-services] DATABASE_URL is not set.");
  process.exit(1);
}
if (!VAULTYS_DB_PATH) {
  console.error("[configure-services] VAULTYS_DB_PATH is not set.");
  process.exit(1);
}

// ── SQLite helpers (mirrors lib/db.ts but without the singleton state) ────────

function openDb(): Database.Database {
  const db = new Database(VAULTYS_DB_PATH!);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
  ).run(key, value);
}

// ── Encryption (mirrors lib/vault.ts) ─────────────────────────────────────────

async function getServerSecret(): Promise<string> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'serverSecret'"
    );
    const secret = res.rows[0]?.value;
    if (!secret) throw new Error("serverSecret not found in PostgreSQL settings");
    return secret;
  } finally {
    await client.end();
  }
}

async function encryptWithServerVid(plaintext: string): Promise<string> {
  const secret = await getServerSecret();
  const vid = VaultysId.fromSecret(secret, "base64").toVersion(1);
  return await vid.signcrypt(plaintext, [vid.id]);
}

// ── Create MinIO bucket ───────────────────────────────────────────────────────

async function ensureMinIoBucket(): Promise<void> {
  console.log(`[configure-services] Ensuring MinIO bucket "${minioBucket}" exists…`);
  const s3 = new S3Client({
    endpoint: minioEndpoint,
    region: "us-east-1",
    credentials: { accessKeyId: minioUser, secretAccessKey: minioPass },
    forcePathStyle: true,
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: minioBucket }));
    console.log(`[configure-services] Bucket "${minioBucket}" already exists.`);
    return;
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err?.name !== "NotFound" && err?.name !== "NoSuchBucket") {
      // Unexpected error — bucket might exist anyway
    }
  }

  await s3.send(new CreateBucketCommand({ Bucket: minioBucket }));
  console.log(`[configure-services] Bucket "${minioBucket}" created.`);
}

// ── Write settings to SQLite ──────────────────────────────────────────────────

async function configureMinioStorage(db: Database.Database): Promise<void> {
  console.log("[configure-services] Writing MinIO / S3 storage settings…");

  const encAccessKey = await encryptWithServerVid(minioUser);
  const encSecretKey = await encryptWithServerVid(minioPass);

  setSetting(db, "storage_type",            "s3");
  setSetting(db, "s3_region",               "us-east-1");
  setSetting(db, "s3_bucket",               minioBucket);
  setSetting(db, "s3_endpoint",             minioEndpoint);
  setSetting(db, "s3_access_key_id_enc",    encAccessKey);
  setSetting(db, "s3_secret_access_key_enc", encSecretKey);

  console.log("[configure-services] S3 storage settings saved.");
}

function configureDocling(db: Database.Database): void {
  console.log(`[configure-services] Writing Docling settings (${doclingUrl})…`);
  setSetting(db, "docling_url",     doclingUrl);
  setSetting(db, "docling_enabled", "true");
  console.log("[configure-services] Docling settings saved.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!skipMinio) {
    try {
      await ensureMinIoBucket();
    } catch (err) {
      console.warn(`[configure-services] MinIO bucket setup failed: ${(err as Error).message}`);
      console.warn("[configure-services] You can configure storage manually in Settings > Storage.");
    }
  }

  const db = openDb();
  try {
    if (!skipMinio) {
      try {
        await configureMinioStorage(db);
      } catch (err) {
        console.warn(`[configure-services] S3 settings write failed: ${(err as Error).message}`);
        console.warn("[configure-services] Configure storage manually in Settings > Storage.");
      }
    }

    if (!skipDocling) {
      configureDocling(db);
    }
  } finally {
    db.close();
  }

  console.log("[configure-services] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[configure-services] Fatal:", err);
  process.exit(1);
});
