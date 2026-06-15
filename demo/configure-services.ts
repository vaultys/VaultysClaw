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
 *   DATABASE_URL=... \
 *     tsx ../../demo/configure-services.ts \
 *       --minio-endpoint http://localhost:9000 \
 *       --minio-bucket   demo-files            \
 *       --minio-user     minioadmin            \
 *       --minio-pass     minioadmin            \
 *       --docling-url    http://localhost:5001
 */

import { VaultysId } from "@vaultys/id";
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

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[configure-services] DATABASE_URL is not set.");
  process.exit(1);
}

// ── PostgreSQL helpers ────────────────────────────────────────────────────────

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function getSetting(key: string): Promise<string | null> {
  return withClient(async (client) => {
    const res = await client.query<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    return res.rows[0]?.value ?? null;
  });
}

async function setSetting(key: string, value: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, value]
    );
  });
}

// ── Encryption ────────────────────────────────────────────────────────────────

async function encryptWithServerVid(plaintext: string): Promise<string> {
  const secret = await getSetting("serverSecret");
  if (!secret) throw new Error("serverSecret not found in PostgreSQL settings");
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

// ── Write settings to PostgreSQL ──────────────────────────────────────────────

async function configureMinioStorage(): Promise<void> {
  console.log("[configure-services] Writing MinIO / S3 storage settings…");

  const encAccessKey = await encryptWithServerVid(minioUser);
  const encSecretKey = await encryptWithServerVid(minioPass);

  await setSetting("storage_type",             "s3");
  await setSetting("s3_region",                "us-east-1");
  await setSetting("s3_bucket",                minioBucket);
  await setSetting("s3_endpoint",              minioEndpoint);
  await setSetting("s3_access_key_id_enc",     encAccessKey);
  await setSetting("s3_secret_access_key_enc", encSecretKey);

  console.log("[configure-services] S3 storage settings saved.");
}

async function configureDocling(): Promise<void> {
  console.log(`[configure-services] Writing Docling settings (${doclingUrl})…`);
  await setSetting("docling_url",     doclingUrl);
  await setSetting("docling_enabled", "true");
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

    try {
      await configureMinioStorage();
    } catch (err) {
      console.warn(`[configure-services] S3 settings write failed: ${(err as Error).message}`);
      console.warn("[configure-services] Configure storage manually in Settings > Storage.");
    }
  }

  if (!skipDocling) {
    try {
      await configureDocling();
    } catch (err) {
      console.warn(`[configure-services] Docling settings write failed: ${(err as Error).message}`);
    }
  }

  console.log("[configure-services] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[configure-services] Fatal:", err);
  process.exit(1);
});
