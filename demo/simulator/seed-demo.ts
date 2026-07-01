#!/usr/bin/env tsx
/**
 * VaultysClaw Comprehensive Demo Seed
 *
 * Creates a complete, realistic demo environment:
 *  - Server identity (enables secret encryption)
 *  - 8 fully-configured workspaces
 *  - 200+ users (executives, VPs, leads, ICs)
 *  - LLM model registry (from demo-config.json)
 *  - MinIO S3 + Docling settings (from demo-config.json)
 *  - PeerJS enabled
 *  - 3 channels per workspace
 *  - Skills per workspace
 *  - Workspace and agent policies
 *  - 30 simulator agents with geo-locations, LLM config, knowledge sources
 *  - 15 workflows — CRON, manual, human-approval
 *  - Demo API key for scenario runner
 *
 * Idempotent: safe to re-run.
 *
 * Usage:  pnpm demo:seed
 */

import "../../packages/control-plane/lib/env-preload.js";
import { prisma } from "../../packages/control-plane/db/client.js";
import { VaultysId } from "@vaultys/id";

// ── Inline helpers (replaces @/-aliased imports from vault.ts / settings.dao.ts)
// vault.ts and settings.dao.ts import from "@/db" which only resolves inside
// the control-plane package context.  We inline what we need here.

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Bootstrap the server VaultysId secret (idempotent). */
async function ensureServerIdentity(): Promise<void> {
  const existing = await getSetting("serverSecret");
  if (existing) return;
  const vid = (await VaultysId.generateMachine()).toVersion(1);
  await setSetting("serverSecret", vid.getSecret("base64"));
}

/**
 * Encrypt a plaintext secret the same way vault.ts does:
 *   VaultysId.signcrypt(plaintext, [vid.id])
 * Requires ensureServerIdentity() to have been called first.
 */
async function encryptSecret(plaintext: string): Promise<string> {
  const secret = await getSetting("serverSecret");
  if (!secret) throw new Error("serverSecret not in DB — call ensureServerIdentity first");
  const vid = VaultysId.fromSecret(secret, "base64").toVersion(1);
  return vid.signcrypt(plaintext, [vid.id]);
}

/** Write MinIO/S3 config to the settings table with encrypted credentials. */
async function setStorageConfig(cfg: {
  storageType: string; s3Enabled: boolean; s3Region: string; s3Bucket: string;
  s3Endpoint: string; s3AccessKeyId: string; s3SecretAccessKey: string;
  locationLat?: number | null; locationLon?: number | null; locationLabel?: string | null;
}): Promise<void> {
  await setSetting("storage_type", cfg.storageType);
  await setSetting("s3_enabled",   cfg.s3Enabled ? "true" : "false");
  await setSetting("s3_region",    cfg.s3Region);
  await setSetting("s3_bucket",    cfg.s3Bucket);
  await setSetting("s3_endpoint",  cfg.s3Endpoint);
  await setSetting("s3_access_key_id_enc",     await encryptSecret(cfg.s3AccessKeyId));
  await setSetting("s3_secret_access_key_enc", await encryptSecret(cfg.s3SecretAccessKey));
  if (cfg.locationLat  != null) await setSetting("s3_location_lat",   String(cfg.locationLat));
  if (cfg.locationLon  != null) await setSetting("s3_location_lon",   String(cfg.locationLon));
  if (cfg.locationLabel)        await setSetting("s3_location_label", cfg.locationLabel);
}

/** Write Docling config to the settings table. */
async function setDoclingConfig(cfg: {
  url: string; enabled: boolean;
  locationLat?: number | null; locationLon?: number | null; locationLabel?: string | null;
}): Promise<void> {
  await setSetting("docling_url",     cfg.url);
  await setSetting("docling_enabled", cfg.enabled ? "true" : "false");
  if (cfg.locationLat  != null) await setSetting("docling_location_lat",   String(cfg.locationLat));
  if (cfg.locationLon  != null) await setSetting("docling_location_lon",   String(cfg.locationLon));
  if (cfg.locationLabel)        await setSetting("docling_location_label", cfg.locationLabel);
}
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { DEMO_AGENTS, DEMO_API_KEY } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDENTITIES_DIR = path.join(__dirname, "identities");
const CONFIG_PATH = path.join(__dirname, "demo-config.json");

// ── Config ───────────────────────────────────────────────────────────────────

interface DemoConfig {
  llm: Record<string, {
    apiKey: string;
    baseUrl: string;
    models: { id: string; name: string; description?: string }[];
  }>;
  minio: { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string; locationLat?: number; locationLon?: number; locationLabel?: string };
  docling: { url: string; locationLat?: number; locationLon?: number; locationLabel?: string };
  peerjs: { enabled: boolean; serverUrl?: string };
}

function loadConfig(): DemoConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log("  ⚠  demo/demo-config.json not found — using defaults");
    return {
      llm: {},
      minio: { endpoint: "http://127.0.0.1:9000", bucket: "vc-demo-files", accessKey: "minioadmin", secretKey: "minioadmin123", region: "us-east-1" },
      docling: { url: "http://127.0.0.1:5001" },
      peerjs: { enabled: false },
    };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as DemoConfig;
}

// ── ID helpers ────────────────────────────────────────────────────────────────

function makeId(prefix: string, seed: string): string {
  const h = crypto.createHash("sha256").update(`${prefix}:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function makeDid(seed: string): string {
  const hex = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `did:vaultys:${hex}`;
}

function hashPick<T>(arr: T[], seed: string): T {
  const v = parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return arr[v % arr.length];
}

function hashFloat(seed: string): number {
  return parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

// ── VaultysId helpers ─────────────────────────────────────────────────────────

async function loadOrCreateIdentity(name: string): Promise<VaultysId> {
  if (!fs.existsSync(IDENTITIES_DIR)) fs.mkdirSync(IDENTITIES_DIR, { recursive: true });
  const file = path.join(IDENTITIES_DIR, `${name}.txt`);
  if (fs.existsSync(file)) {
    return VaultysId.fromSecret(fs.readFileSync(file, "utf-8").trim(), "base64").toVersion(1);
  }
  const vid = await VaultysId.generateMachine();
  fs.writeFileSync(file, vid.toVersion(1).getSecret("base64"), "utf-8");
  return vid.toVersion(1);
}

// ── Workspace data ────────────────────────────────────────────────────────────────

const WORKSPACES = [
  { name: "Engineering",          slug: "engineering",      color: "#6366f1", desc: "Software development, code review, testing and documentation agents", caps: ["code_execution", "file_access", "api_call"] },
  { name: "Security Operations",  slug: "security-ops",     color: "#ef4444", desc: "Threat detection, vulnerability scanning and incident response agents", caps: ["internet_access", "api_call", "system_command"] },
  { name: "DevOps & Infra",       slug: "devops",           color: "#f59e0b", desc: "CI/CD pipelines, deployments, and infrastructure automation agents", caps: ["code_execution", "system_command", "api_call", "file_access"] },
  { name: "Finance & Compliance", slug: "finance",          color: "#10b981", desc: "Financial reporting, expense analysis and regulatory compliance agents", caps: ["file_access", "api_call"] },
  { name: "Data & Analytics",     slug: "data",             color: "#8b5cf6", desc: "ML pipelines, ETL jobs, analytics and insight generation agents", caps: ["code_execution", "file_access", "api_call"] },
  { name: "Customer Success",     slug: "customer-success", color: "#06b6d4", desc: "Ticket routing, sentiment analysis and customer engagement agents", caps: ["api_call", "mail_send"] },
  { name: "Legal & Audit",        slug: "legal",            color: "#64748b", desc: "Contract review, GDPR compliance and regulatory tracking agents", caps: ["file_access", "api_call"] },
  { name: "Product",              slug: "product",          color: "#f97316", desc: "Feature flags, A/B testing, roadmap and analytics agents", caps: ["api_call", "internet_access"] },
] as const;

// ── User data ─────────────────────────────────────────────────────────────────

const FIRST_NAMES = ["Alex", "Jordan", "Morgan", "Riley", "Taylor", "Casey", "Drew", "Avery", "Quinn", "Blake", "Reese", "Skyler", "Logan", "Parker", "Hayden", "Cameron", "Sage", "River", "Phoenix", "Rowan", "Emery", "Finley", "Harper", "Elliot", "Remy", "Jesse", "Jamie", "Kendall", "Lane", "Ellis"];
const LAST_NAMES = ["Chen", "Okafor", "Müller", "Patel", "Nakamura", "Ferreira", "Hassan", "Lindqvist", "Kowalski", "Nguyen", "Johansson", "Kim", "Garcia", "Smith", "Johnson", "Williams", "Brown", "Martinez", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Walker", "Young", "Allen", "Scott", "Lee", "Martinez"];

// CEO/owner is intentionally excluded — the real user claims ownership
// interactively via the setup wizard before the seed runs.
const EXECUTIVES = [
  { seed: "exec-cto",  title: "Chief Technology Officer",    globalAdmin: true },
  { seed: "exec-ciso", title: "Chief Information Security Officer", globalAdmin: true },
  { seed: "exec-cfo",  title: "Chief Financial Officer",     globalAdmin: false },
  { seed: "exec-cpo",  title: "Chief Product Officer",       globalAdmin: false },
  { seed: "exec-coo",  title: "Chief Operating Officer",     globalAdmin: false },
];

// ── Channel templates ─────────────────────────────────────────────────────────

const COMMON_CHANNELS = [
  { name: "general",       slug: "general",       topic: "General workspace discussion", public: true },
  { name: "announcements", slug: "announcements", topic: "Important announcements",  public: true },
  { name: "ai-activity",   slug: "ai-activity",   topic: "AI agent outputs and alerts", public: true },
];

const WORKSPACE_CHANNELS: Record<string, { name: string; slug: string; topic: string }[]> = {
  "engineering":      [{ name: "code-reviews", slug: "code-reviews", topic: "Automated code reviews" }, { name: "releases", slug: "releases", topic: "Release tracking" }],
  "security-ops":     [{ name: "incidents",    slug: "incidents",    topic: "Security incidents" },      { name: "cve-alerts", slug: "cve-alerts", topic: "CVE notifications" }],
  "devops":           [{ name: "deployments",  slug: "deployments",  topic: "Deploy activity" },         { name: "monitoring", slug: "monitoring", topic: "System alerts" }],
  "finance":          [{ name: "reports",      slug: "reports",      topic: "Financial reports" },        { name: "compliance", slug: "compliance", topic: "Compliance updates" }],
  "data":             [{ name: "pipelines",    slug: "pipelines",    topic: "Data pipeline status" },     { name: "insights",   slug: "insights",   topic: "Analytics insights" }],
  "customer-success": [{ name: "tickets",      slug: "tickets",      topic: "Support tickets" },          { name: "escalations", slug: "escalations", topic: "Escalated cases" }],
  "legal":            [{ name: "contracts",    slug: "contracts",    topic: "Contract reviews" },         { name: "gdpr-log",   slug: "gdpr-log",   topic: "GDPR audit trail" }],
  "product":          [{ name: "roadmap",      slug: "roadmap",      topic: "Roadmap discussion" },       { name: "experiments", slug: "experiments", topic: "A/B tests" }],
};

// ── Skills ────────────────────────────────────────────────────────────────────

const WORKSPACE_SKILLS: Record<string, { name: string; description: string; isRequired: boolean }[]> = {
  "engineering":      [
    { name: "code-review",       description: "Automated code quality and security review",    isRequired: true },
    { name: "test-generation",   description: "Generate unit and integration tests",            isRequired: false },
    { name: "docs-generation",   description: "Generate API and code documentation",            isRequired: false },
    { name: "dependency-audit",  description: "Audit and update dependencies for CVEs",        isRequired: false },
  ],
  "security-ops":     [
    { name: "threat-analysis",   description: "Analyse threat indicators and IOCs",             isRequired: true },
    { name: "vulnerability-scan",description: "Scan services for known CVEs",                   isRequired: true },
    { name: "incident-response", description: "Automated incident triage and containment",      isRequired: false },
  ],
  "devops":           [
    { name: "deployment",        description: "Deploy services to cloud environments",          isRequired: true },
    { name: "infrastructure",    description: "Provision and manage cloud infrastructure",      isRequired: false },
    { name: "monitoring",        description: "Monitor service health and alert routing",       isRequired: false },
  ],
  "finance":          [
    { name: "financial-report",  description: "Generate P&L, balance sheet and cash-flow reports", isRequired: true },
    { name: "fraud-detection",   description: "Real-time transaction anomaly detection",        isRequired: true },
    { name: "compliance-check",  description: "Regulatory compliance verification",             isRequired: false },
  ],
  "data":             [
    { name: "etl-pipeline",      description: "Extract, transform and load data pipelines",     isRequired: true },
    { name: "ml-training",       description: "Train and evaluate ML models",                   isRequired: false },
    { name: "data-quality",      description: "Data quality checks and anomaly detection",      isRequired: false },
  ],
  "customer-success": [
    { name: "ticket-routing",    description: "Intelligently route support tickets",            isRequired: true },
    { name: "sentiment-analysis",description: "Analyse customer sentiment across channels",     isRequired: false },
    { name: "churn-prediction",  description: "Predict and prevent customer churn",             isRequired: false },
  ],
  "legal":            [
    { name: "contract-review",   description: "Review and redline contracts",                   isRequired: true },
    { name: "gdpr-check",        description: "GDPR and data-privacy compliance checks",        isRequired: true },
    { name: "regulatory-watch",  description: "Monitor for regulatory changes",                 isRequired: false },
  ],
  "product":          [
    { name: "feature-flags",     description: "Feature flag management and rollout",            isRequired: false },
    { name: "ab-testing",        description: "Design and analyse A/B experiments",             isRequired: false },
    { name: "metrics-dashboard", description: "Product KPI aggregation and reporting",         isRequired: false },
  ],
};

// ── Step implementations ──────────────────────────────────────────────────────

async function seedServerIdentity(): Promise<void> {
  console.log("\n▶ Bootstrapping server identity…");
  await ensureServerIdentity();
  console.log("  ✓ serverSecret ready (enables credential encryption)");
}

async function seedWorkspaces(): Promise<Map<string, string>> {
  console.log("\n▶ Seeding workspaces…");
  const slugToId = new Map<string, string>();

  for (const r of WORKSPACES) {
    const id = makeId("workspace", r.slug);
    await prisma.workspace.upsert({
      where: { id },
      create: { id, name: r.name, slug: r.slug, description: r.desc, color: r.color, defaultCapabilities: r.caps },
      update: { name: r.name, slug: r.slug, description: r.desc, color: r.color, defaultCapabilities: r.caps },
    });
    slugToId.set(r.slug, id);
    process.stdout.write(".");
  }
  console.log(`\n  ✓ ${WORKSPACES.length} workspaces`);
  return slugToId;
}

async function seedUsers(workspaceSlugToId: Map<string, string>): Promise<{ ownerUserId: string; ownerDid: string; execUserIds: string[] }> {
  console.log("\n▶ Seeding users…");
  let count = 0;

  // Helper to upsert a user and return their DB id.
  // User.id is a plain String @id — no @default, so we must supply it.
  async function upsert(
    did: string,
    email: string,
    name: string,
    extra: { role?: "Owner" | "Admin" | "Member"; reportsTo?: string } = {},
  ): Promise<string> {
    // Derive a stable deterministic id from the DID so re-runs are idempotent
    const id = makeId("user", did);
    await prisma.user.upsert({
      where: { id },
      create: { id, did, email, name, role: extra.role ?? "Member", reportsTo: extra.reportsTo ?? null },
      update: { email, name, role: extra.role ?? "Member", reportsTo: extra.reportsTo ?? null },
    });
    count++;
    return id;
  }

  // Resolve the real owner — the user who claimed ownership via the setup wizard.
  // Workflows with human-approval steps will be assigned to this user.
  const realOwner = await prisma.user.findFirst({ where: { role: "Owner" } });
  const ownerUserId = realOwner?.id ?? "";
  const ownerDid = realOwner?.did ?? "";
  if (!realOwner) {
    console.log("  ⚠  No owner found — human-approval workflow steps will have no assigned approver.");
    console.log("     Claim ownership at http://localhost:3000 then re-run pnpm demo:seed to fix.");
  } else {
    console.log(`  ✓ Owner: ${realOwner.name ?? realOwner.did ?? realOwner.id}`);
  }

  // Executives (CEO/owner deliberately excluded — the real user IS the owner)
  const execUserIds: string[] = [];

  for (const exec of EXECUTIVES) {
    const did = makeDid(exec.seed);
    const fn = hashPick(FIRST_NAMES, `${exec.seed}-fn`);
    const ln = hashPick(LAST_NAMES, `${exec.seed}-ln`);
    const name = `${fn} ${ln}`;
    const email = `${exec.seed}@demo.vaultysclaw.io`;
    const uid = await upsert(did, email, name, {
      role: exec.globalAdmin ? "Admin" : "Member",
    });
    execUserIds.push(uid);

    // Add to all workspaces
    for (const [, workspaceId] of workspaceSlugToId) {
      await prisma.userWorkspace.upsert({
        where: { userId_workspaceId: { userId: uid, workspaceId } },
        create: { userId: uid, workspaceId, isPrimary: false, isWorkspaceAdmin: exec.globalAdmin },
        update: {},
      }).catch(() => {});
    }
    process.stdout.write(".");
  }

  // VPs (one per workspace, workspace admin)
  const vpUserIds = new Map<string, string>();
  for (const [slug, workspaceId] of workspaceSlugToId) {
    const did = makeDid(`vp-${slug}`);
    const fn = hashPick(FIRST_NAMES, `vp-${slug}-fn`);
    const ln = hashPick(LAST_NAMES, `vp-${slug}-ln`);
    const uid = await upsert(did, `vp.${slug}@demo.vaultysclaw.io`, `${fn} ${ln} (VP)`, { reportsTo: execUserIds[0] });
    vpUserIds.set(slug, uid);
    await prisma.userWorkspace.upsert({
      where: { userId_workspaceId: { userId: uid, workspaceId } },
      create: { userId: uid, workspaceId, isPrimary: true, isWorkspaceAdmin: true },
      update: {},
    }).catch(() => {});
    process.stdout.write(".");
  }

  // Leads (3 per workspace)
  const leadUserIds = new Map<string, string[]>();
  for (const [slug, workspaceId] of workspaceSlugToId) {
    const vpId = vpUserIds.get(slug);
    const workspaceLeads: string[] = [];
    for (let i = 0; i < 3; i++) {
      const did = makeDid(`lead-${slug}-${i}`);
      const fn = hashPick(FIRST_NAMES, `lead-${slug}-${i}-fn`);
      const ln = hashPick(LAST_NAMES, `lead-${slug}-${i}-ln`);
      const uid = await upsert(did, `lead${i}.${slug}@demo.vaultysclaw.io`, `${fn} ${ln}`, { reportsTo: vpId });
      workspaceLeads.push(uid);
      await prisma.userWorkspace.upsert({
        where: { userId_workspaceId: { userId: uid, workspaceId } },
        create: { userId: uid, workspaceId, isPrimary: true, isWorkspaceAdmin: false },
        update: {},
      }).catch(() => {});
      process.stdout.write(".");
    }
    leadUserIds.set(slug, workspaceLeads);
  }

  // ICs (12 per workspace)
  for (const [slug, workspaceId] of workspaceSlugToId) {
    const workspaceLeads = leadUserIds.get(slug) || [];
    const vpId = vpUserIds.get(slug);
    for (let i = 0; i < 12; i++) {
      const did = makeDid(`ic-${slug}-${i}`);
      const fn = hashPick(FIRST_NAMES, `ic-${slug}-${i}-fn`);
      const ln = hashPick(LAST_NAMES, `ic-${slug}-${i}-ln`);
      const suffix = Math.abs(parseInt(crypto.createHash("md5").update(did).digest("hex").slice(0, 4), 16) % 99);
      const manager = workspaceLeads.length > 0 ? workspaceLeads[i % workspaceLeads.length] : vpId;
      const uid = await upsert(did, `${fn.toLowerCase()}.${ln.toLowerCase()}${suffix}@demo.vaultysclaw.io`, `${fn} ${ln}`, { reportsTo: manager });
      await prisma.userWorkspace.upsert({
        where: { userId_workspaceId: { userId: uid, workspaceId } },
        create: { userId: uid, workspaceId, isPrimary: true, isWorkspaceAdmin: false },
        update: {},
      }).catch(() => {});
    }
    process.stdout.write(".");
  }

  console.log(`\n  ✓ ${count} new users (+ existing)`);
  return { ownerUserId, ownerDid, execUserIds };
}

async function seedLlmModels(cfg: DemoConfig, workspaceSlugToId: Map<string, string>): Promise<Map<string, string>> {
  console.log("\n▶ Seeding LLM model registry…");
  const modelIdMap = new Map<string, string>(); // "provider/modelId" → registry id
  const allWorkspaceIds = [...workspaceSlugToId.values()];

  for (const [provider, provCfg] of Object.entries(cfg.llm)) {
    const hasKey = provCfg.apiKey && !provCfg.apiKey.startsWith("YOUR_") && provCfg.apiKey.trim() !== "";
    let apiKeyEnc: string | null = null;
    if (hasKey) {
      try { apiKeyEnc = await encryptSecret(provCfg.apiKey); } catch { /* server secret not ready */ }
    }

    for (const model of provCfg.models) {
      const id = makeId("model", `${provider}/${model.id}`);
      const litellmName = `${provider}/${model.id.toLowerCase().replace(/\s+/g, "-")}`;

      await prisma.modelRegistry.upsert({
        where: { id },
        create: {
          id,
          name: model.name,
          description: model.description ?? null,
          provider,
          modelId: model.id,
          baseUrl: provCfg.baseUrl,
          apiKeyEnc,
          litellmModelName: litellmName,
          status: "active",
          metadata: {},
          createdBy: makeDid("exec-cto"),
        },
        update: { apiKeyEnc, status: "active" },
      });

      modelIdMap.set(`${provider}/${model.id}`, id);

      // Grant access to all workspaces
      for (const workspaceId of allWorkspaceIds) {
        await prisma.modelWorkspaceAccess.upsert({
          where: { modelId_workspaceId: { modelId: id, workspaceId } },
          create: { modelId: id, workspaceId },
          update: {},
        }).catch(() => {});
      }
      process.stdout.write(".");
    }
  }

  const total = modelIdMap.size;
  console.log(`\n  ✓ ${total} models${total > 0 ? " (add API keys in demo-config.json to enable)" : ""}`);
  return modelIdMap;
}

async function seedServiceSettings(cfg: DemoConfig): Promise<void> {
  console.log("\n▶ Configuring MinIO S3 and Docling settings…");
  const m = cfg.minio;
  await setStorageConfig({
    storageType: "s3",
    s3Enabled: true,
    s3Region: m.region,
    s3Bucket: m.bucket,
    s3Endpoint: m.endpoint,
    s3AccessKeyId: m.accessKey,
    s3SecretAccessKey: m.secretKey,
    locationLat: m.locationLat ?? null,
    locationLon: m.locationLon ?? null,
    locationLabel: m.locationLabel ?? null,
  });

  const d = cfg.docling;
  await setDoclingConfig({
    url: d.url,
    enabled: true,
    locationLat: d.locationLat ?? null,
    locationLon: d.locationLon ?? null,
    locationLabel: d.locationLabel ?? null,
  });

  if (cfg.peerjs.enabled) {
    await setSetting("peerjs_enabled", "true");
    if (cfg.peerjs.serverUrl) await setSetting("peerjs_server_url", cfg.peerjs.serverUrl);
    console.log("  ✓ PeerJS enabled" + (cfg.peerjs.serverUrl ? ` (${cfg.peerjs.serverUrl})` : ""));
  }

  console.log("  ✓ MinIO S3 configured  →", m.endpoint, "/", m.bucket);
  console.log("  ✓ Docling configured   →", d.url);
}

async function seedChannels(workspaceSlugToId: Map<string, string>, ownerDid: string): Promise<void> {
  console.log("\n▶ Seeding channels…");
  let count = 0;

  for (const [slug, workspaceId] of workspaceSlugToId) {
    const allChannels = [
      ...COMMON_CHANNELS,
      ...(WORKSPACE_CHANNELS[slug as keyof typeof WORKSPACE_CHANNELS] ?? []),
    ];

    for (const ch of allChannels) {
      const id = makeId("channel", `${slug}/${ch.slug}`);
      await prisma.channel.upsert({
        where: { id },
        create: { id, workspaceId, name: ch.name, slug: ch.slug, topic: ch.topic, isPublic: ch.public ?? true, creatorDid: ownerDid },
        update: { topic: ch.topic },
      });
      count++;
    }
  }
  console.log(`  ✓ ${count} channels`);
}

async function seedSkills(workspaceSlugToId: Map<string, string>): Promise<Map<string, string>> {
  console.log("\n▶ Seeding workspace skills…");
  const skillMap = new Map<string, string>(); // "slug/name" → id
  let count = 0;

  for (const [slug, workspaceId] of workspaceSlugToId) {
    const skills = WORKSPACE_SKILLS[slug as keyof typeof WORKSPACE_SKILLS] ?? [];
    for (const sk of skills) {
      const id = makeId("skill", `${slug}/${sk.name}`);
      await prisma.workspaceSkill.upsert({
        where: { id },
        create: { id, workspaceId, name: sk.name, description: sk.description, isRequired: sk.isRequired, config: {} },
        update: { description: sk.description, isRequired: sk.isRequired },
      });
      skillMap.set(`${slug}/${sk.name}`, id);
      count++;
    }
  }
  console.log(`  ✓ ${count} skills`);
  return skillMap;
}

async function seedPolicies(workspaceSlugToId: Map<string, string>, ctoDid: string): Promise<Map<string, string>> {
  console.log("\n▶ Seeding workspace policies…");
  const policyMap = new Map<string, string>(); // workspaceSlug → policyId

  for (const [slug, workspaceId] of workspaceSlugToId) {
    const workspace = WORKSPACES.find(r => r.slug === slug)!;
    const id = `policy-${makeId("rp", slug)}`;
    await prisma.policy.upsert({
      where: { id },
      create: {
        id,
        workspaceId,
        capabilities: workspace.caps,
        resourceLimits: { maxTokensPerDay: 500_000, maxTokensPerMonth: 10_000_000 },
        createdBy: ctoDid,
      },
      update: { capabilities: workspace.caps },
    });
    policyMap.set(slug, id);
    process.stdout.write(".");
  }
  console.log(`\n  ✓ ${WORKSPACES.length} workspace policies`);
  return policyMap;
}

async function seedAgents(
  workspaceSlugToId: Map<string, string>,
  modelIdMap: Map<string, string>,
  skillMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log("\n▶ Seeding demo agents…");
  const didMap = new Map<string, string>(); // agentName → did

  // Pick a model ID for the LLM config (use first available from provider, fallback to metadata only)
  function pickModelId(provider: string, modelId: string): string | null {
    return modelIdMap.get(`${provider}/${modelId}`) ?? null;
  }

  for (const agentCfg of DEMO_AGENTS) {
    const vid = await loadOrCreateIdentity(agentCfg.name);
    const did = vid.did;
    didMap.set(agentCfg.name, did);

    const modelRegistryId = pickModelId(agentCfg.provider, agentCfg.model);
    const llmConfig = {
      provider: agentCfg.provider,
      model: agentCfg.model,
      maxTokens: 4096,
      pricePerMillionInputTokens: agentCfg.inputPrice,
      pricePerMillionOutputTokens: agentCfg.outputPrice,
    };

    await prisma.agent.upsert({
      where: { did },
      create: {
        did,
        name: agentCfg.name,
        capabilities: agentCfg.capabilities,
        llmConfig,
        locationLat: agentCfg.location.lat,
        locationLon: agentCfg.location.lon,
        locationLabel: agentCfg.location.label,
        registeredAt: new Date(),
        lastSeen: new Date(),
      },
      update: {
        name: agentCfg.name,
        capabilities: agentCfg.capabilities,
        llmConfig,
        locationLat: agentCfg.location.lat,
        locationLon: agentCfg.location.lon,
        locationLabel: agentCfg.location.label,
        lastSeen: new Date(),
      },
    });

    // Workspace membership
    const workspace = await prisma.workspace.findFirst({ where: { slug: agentCfg.workspace } });
    if (workspace) {
      await prisma.agentWorkspace.upsert({
        where: { agentDid_workspaceId: { agentDid: did, workspaceId: workspace.id } },
        create: { agentDid: did, workspaceId: workspace.id, isPrimary: true },
        update: {},
      });
    }

    // Assign skills for this workspace
    const workspaceSkills = Object.entries(Object.fromEntries(skillMap))
      .filter(([k]) => k.startsWith(`${agentCfg.workspace}/`))
      .map(([, skillId]) => skillId);

    for (const skillId of workspaceSkills) {
      await prisma.agentSkillOverride.upsert({
        where: { agentDid_workspaceSkillId: { agentDid: did, workspaceSkillId: skillId } },
        create: { agentDid: did, workspaceSkillId: skillId, enabled: true },
        update: {},
      }).catch(() => {});
    }

    // Per-agent policy
    const workspaceId = workspaceSlugToId.get(agentCfg.workspace);
    if (workspaceId) {
      const policyId = `policy-${makeId("ap", agentCfg.name)}`;
      await prisma.policy.upsert({
        where: { id: policyId },
        create: {
          id: policyId,
          agentDid: did,
          capabilities: agentCfg.capabilities,
          resourceLimits: { maxTokensPerDay: 200_000, maxTokensPerMonth: 4_000_000 },
          createdBy: makeDid("exec-cto"),
        },
        update: { capabilities: agentCfg.capabilities },
      });
    }

    // Knowledge source (1 per agent)
    if (workspaceId) {
      const ksId = makeId("ks", agentCfg.name);
      await prisma.knowledgeSource.upsert({
        where: { id: ksId },
        create: {
          id: ksId,
          workspaceId,
          agentDid: did,
          name: `${agentCfg.name} — Team Knowledge Base`,
          sourceType: "file",
          config: { description: `Reference documents and runbooks for ${agentCfg.name}` },
          status: "idle",
        },
        update: {},
      });
    }

    process.stdout.write(".");
  }

  console.log(`\n  ✓ ${DEMO_AGENTS.length} agents (identities, workspaces, skills, policies, knowledge)`);
  return didMap;
}

async function seedWorkflows(
  workspaceSlugToId: Map<string, string>,
  agentDidMap: Map<string, string>,
  ownerDid: string,
  ownerUserId: string,
): Promise<void> {
  console.log("\n▶ Seeding workflows…");

  const ctoDid = makeDid("exec-cto");

  function ag(name: string): string {
    return agentDidMap.get(name) ?? name;
  }

  function node(id: string, agentName: string, action: string, label?: string, pos?: { x: number; y: number }) {
    return { id, type: "agent", data: { agentId: ag(agentName), action, label: label ?? action.replaceAll("_", " ") }, position: pos ?? { x: 0, y: 0 } };
  }

  function userNode(id: string, assignedUserId: string, message: string, timeout = 1440) {
    return { id, type: "user", data: { assignedUserId, mode: "approval", message, timeout } };
  }

  function edge(id: string, source: string, target: string) {
    return { id, source, target };
  }

  // cronNextRun: compute approximate next run from now + offset
  function nextRun(cron: string): Date {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  }

  const workflows: {
    name: string; desc: string; workspace: string; cron?: string; definition: object
  }[] = [
    // ── 1. Code Quality Pipeline (daily, Engineering) ──────────────────
    {
      name: "Code Quality Pipeline",
      desc: "Parallel review + lint + tests → documentation update",
      workspace: "engineering",
      cron: "0 9 * * *",
      definition: {
        nodes: [
          node("review", "code-review-sf",       "analyze_code",   "Code Review",   { x: 0,   y: 0 }),
          node("lint",   "lint-enforcer-toronto", "lint_enforce",   "Lint Check",    { x: 200, y: 0 }),
          node("tests",  "test-runner-berlin",    "run_tests",      "Run Tests",     { x: 400, y: 0 }),
          node("docs",   "docs-writer-bangalore", "write_docs",     "Update Docs",   { x: 200, y: 200 }),
        ],
        edges: [edge("e1","review","docs"), edge("e2","lint","docs"), edge("e3","tests","docs")],
      },
    },

    // ── 2. Security Threat Assessment (daily, Security Ops) ────────────
    {
      name: "Security Threat Assessment",
      desc: "Vulnerability scan + threat analysis + SIEM correlation → audit report",
      workspace: "security-ops",
      cron: "0 7 * * *",
      definition: {
        nodes: [
          node("vuln",   "vuln-scanner-tlv",        "scan_vulnerabilities", "Vulnerability Scan"),
          node("threat", "threat-analyzer-sg",       "analyze_threats",     "Threat Analysis"),
          node("siem",   "siem-correlator-frankfurt","correlate_events",    "SIEM Correlation"),
          node("audit",  "audit-trail-nyc",          "create_audit_report", "Audit Report"),
        ],
        edges: [edge("e1","vuln","audit"), edge("e2","threat","audit"), edge("e3","siem","audit")],
      },
    },

    // ── 3. Infrastructure Deploy (manual + owner approval) ─────────────
    {
      name: "Infrastructure Deploy",
      desc: "Provision → human approval → deploy → health check → notify",
      workspace: "devops",
      definition: {
        nodes: [
          node("provision", "infra-provisioner-tokyo",  "provision_infrastructure", "Provision Infra"),
          userNode("approval", ownerUserId, "Review infrastructure changes before deploying to production. Step output: ${provision}"),
          node("deploy",    "deploy-agent-amsterdam",   "deploy_application",       "Deploy"),
          node("monitor",   "monitoring-agent-paris",   "verify_deployment",        "Health Check"),
          node("notify",    "alert-handler-sydney",     "notify_team",              "Notify Team"),
        ],
        edges: [edge("e1","provision","approval"), edge("e2","approval","deploy"), edge("e3","deploy","monitor"), edge("e4","monitor","notify")],
      },
    },

    // ── 4. Financial Risk Report (weekly Monday, Finance) ──────────────
    {
      name: "Financial Risk Report",
      desc: "Fraud detection + compliance check → executive report",
      workspace: "finance",
      cron: "0 8 * * 1",
      definition: {
        nodes: [
          node("fraud",      "fraud-detector-chicago",  "detect_anomalies",  "Fraud Detection"),
          node("compliance", "compliance-checker-dubai", "check_compliance",  "Compliance Check"),
          node("report",     "report-generator-zurich", "generate_report",   "Generate Report"),
        ],
        edges: [edge("e1","fraud","report"), edge("e2","compliance","report")],
      },
    },

    // ── 5. Monthly Budget Review (monthly + owner approval) ────────────
    {
      name: "Monthly Budget Review",
      desc: "Generate spend analysis → owner approves → distribute",
      workspace: "finance",
      cron: "0 9 1 * *",
      definition: {
        nodes: [
          node("analysis",  "report-generator-zurich",  "generate_report",    "Spend Analysis"),
          userNode("review", ownerUserId, "Monthly AI infrastructure spend report ready for your review and sign-off. Budget vs Actuals: ${analysis}"),
          node("distribute","report-generator-zurich",  "distribute_report",  "Distribute Report"),
        ],
        edges: [edge("e1","analysis","review"), edge("e2","review","distribute")],
      },
    },

    // ── 6. Product Analytics (daily, Product) ──────────────────────────
    {
      name: "Product Analytics",
      desc: "Collect KPIs + A/B analysis → insights report",
      workspace: "product",
      cron: "0 8 * * *",
      definition: {
        nodes: [
          node("metrics", "metrics-reporter-singapore", "collect_metrics",    "Collect KPIs"),
          node("ab",      "ab-test-runner-stockholm",   "analyze_experiments","A/B Analysis"),
          node("insights","insight-reporter-paris",     "generate_insights",  "Generate Insights"),
        ],
        edges: [edge("e1","metrics","insights"), edge("e2","ab","insights")],
      },
    },

    // ── 7. Incident Response (manual, Security Ops) ────────────────────
    {
      name: "Incident Response",
      desc: "Correlate SIEM events → threat analysis → contain → notify owner",
      workspace: "security-ops",
      definition: {
        nodes: [
          node("correlate","siem-correlator-frankfurt","correlate_events",    "Correlate Events"),
          node("analyze",  "threat-analyzer-sg",       "analyze_threats",     "Threat Analysis"),
          userNode("escalate", ownerUserId, "Security incident requires executive sign-off for containment actions. Threat report: ${analyze}"),
          node("contain",  "vuln-scanner-tlv",          "incident_response",   "Contain Threat"),
          node("audit",    "audit-trail-nyc",            "create_audit_report", "Document Incident"),
        ],
        edges: [edge("e1","correlate","analyze"), edge("e2","analyze","escalate"), edge("e3","escalate","contain"), edge("e4","contain","audit")],
      },
    },

    // ── 8. Contract Review (manual + owner approval, Legal) ────────────
    {
      name: "Contract Review Pipeline",
      desc: "Review contract → GDPR check → risk assessment → owner sign-off",
      workspace: "legal",
      definition: {
        nodes: [
          node("review",   "contract-reviewer-brussels", "review_contract",  "Contract Review"),
          node("gdpr",     "gdpr-agent-berlin",           "gdpr_check",       "GDPR Check"),
          node("risk",     "risk-assessor-geneva",        "risk_assessment",  "Risk Assessment"),
          userNode("signoff", ownerUserId, "Contract requires executive sign-off before execution. Review: ${review} | Risk: ${risk}"),
          node("archive",  "nda-tracker-washington",      "archive_contract", "Archive"),
        ],
        edges: [edge("e1","review","risk"), edge("e2","gdpr","risk"), edge("e3","risk","signoff"), edge("e4","signoff","archive")],
      },
    },

    // ── 9. Quarterly Compliance Audit (quarterly, Legal) ───────────────
    {
      name: "Quarterly Compliance Audit",
      desc: "GDPR + risk assessment + contract review → owner approval → file report",
      workspace: "legal",
      cron: "0 9 1 1,4,7,10 *",
      definition: {
        nodes: [
          node("gdpr",   "gdpr-agent-berlin",           "gdpr_check",       "GDPR Audit"),
          node("risk",   "risk-assessor-geneva",         "risk_assessment",  "Risk Review"),
          node("contracts","contract-reviewer-brussels", "review_contracts", "Contract Sweep"),
          userNode("exec-approval", ownerUserId, "Quarterly compliance audit complete. Requires executive approval before filing. GDPR: ${gdpr} | Risk: ${risk}"),
          node("file",   "nda-tracker-washington",       "file_audit_report","File Report"),
        ],
        edges: [edge("e1","gdpr","exec-approval"), edge("e2","risk","exec-approval"), edge("e3","contracts","exec-approval"), edge("e4","exec-approval","file")],
      },
    },

    // ── 10. Data Quality Check (daily, Data) ───────────────────────────
    {
      name: "Data Quality Check",
      desc: "Run ETL quality gates → ML feature validation → insight report",
      workspace: "data",
      cron: "0 6 * * *",
      definition: {
        nodes: [
          node("etl",     "etl-runner-stockholm",  "run_data_quality",   "ETL Quality Gate"),
          node("features","ml-trainer-montreal",   "validate_features",  "Feature Validation"),
          node("report",  "insight-reporter-paris","generate_insights",  "Quality Report"),
        ],
        edges: [edge("e1","etl","report"), edge("e2","features","report")],
      },
    },

    // ── 11. Release Notes Generator (weekly Friday, Engineering) ────────
    {
      name: "Release Notes Generator",
      desc: "Collect PR summaries → generate changelogs → PR assistant publishes",
      workspace: "engineering",
      cron: "0 17 * * 5",
      definition: {
        nodes: [
          node("prs",   "pr-assistant-london",    "collect_prs",     "Collect PRs"),
          node("gen",   "docs-writer-bangalore",  "write_changelog", "Generate Changelog"),
          node("review","code-review-sf",         "review_release",  "Quality Review"),
          node("pub",   "pr-assistant-london",    "publish_release", "Publish Notes"),
        ],
        edges: [edge("e1","prs","gen"), edge("e2","gen","review"), edge("e3","review","pub")],
      },
    },

    // ── 12. Customer Escalation Handler (manual, Customer Success) ──────
    {
      name: "Customer Escalation Handler",
      desc: "Analyse ticket → sentiment check → route or escalate",
      workspace: "customer-success",
      definition: {
        nodes: [
          node("analyze",  "sentiment-analyzer-sao-paulo","sentiment_analysis",  "Sentiment Analysis"),
          node("route",    "ticket-router-madrid",         "route_ticket",        "Route Ticket"),
          node("sla",      "sla-monitor-melbourne",        "check_sla",           "SLA Check"),
        ],
        edges: [edge("e1","analyze","route"), edge("e2","route","sla")],
      },
    },

    // ── 13. Weekly Ops Digest (weekly Monday, DevOps) ───────────────────
    {
      name: "Weekly Ops Digest",
      desc: "System health + deployment summary + alert review",
      workspace: "devops",
      cron: "0 9 * * 1",
      definition: {
        nodes: [
          node("health",  "monitoring-agent-paris",    "check_system_health", "Health Summary"),
          node("deploys", "deploy-agent-amsterdam",    "summarize_deploys",   "Deploy Summary"),
          node("alerts",  "alert-handler-sydney",      "review_alerts",       "Alert Review"),
          node("report",  "monitoring-agent-paris",    "generate_report",     "Ops Report"),
        ],
        edges: [edge("e1","health","report"), edge("e2","deploys","report"), edge("e3","alerts","report")],
      },
    },

    // ── 14. ML Model Retraining (weekly, Data) ──────────────────────────
    {
      name: "ML Model Retraining",
      desc: "Data quality check → train → validate → deploy model",
      workspace: "data",
      cron: "0 2 * * 6",
      definition: {
        nodes: [
          node("quality", "etl-runner-stockholm",  "run_data_quality",  "Data Quality"),
          node("train",   "ml-trainer-montreal",   "train_model",       "Train Model"),
          node("validate","insight-reporter-paris","validate_model",    "Validate"),
          node("deploy",  "pipeline-agent-seoul",  "deploy_model",      "Deploy Model"),
        ],
        edges: [edge("e1","quality","train"), edge("e2","train","validate"), edge("e3","validate","deploy")],
      },
    },

    // ── 15. Onboarding Readiness Check (weekly, Customer Success) ───────
    {
      name: "Onboarding Readiness Check",
      desc: "Check NPS + churn signals + ticket backlog → weekly health score",
      workspace: "customer-success",
      cron: "0 10 * * 1",
      definition: {
        nodes: [
          node("sentiment","sentiment-analyzer-sao-paulo","sentiment_analysis",  "Sentiment Scan"),
          node("sla",      "sla-monitor-melbourne",       "check_sla",           "SLA Review"),
          node("tickets",  "ticket-router-madrid",        "review_backlog",      "Ticket Backlog"),
          node("score",    "sentiment-analyzer-sao-paulo","generate_health_score","Health Score"),
        ],
        edges: [edge("e1","sentiment","score"), edge("e2","sla","score"), edge("e3","tickets","score")],
      },
    },
  ];

  for (const wf of workflows) {
    const id = makeId("wf", wf.name);
    const workspaceId = workspaceSlugToId.get(wf.workspace) ?? null;
    const hasCron = !!wf.cron;

    await prisma.workflow.upsert({
      where: { id },
      create: {
        id,
        name: wf.name,
        description: wf.desc,
        definition: wf.definition as object,
        workspaceId,
        createdBy: ctoDid,
        scheduleCron: wf.cron ?? null,
        scheduleEnabled: hasCron,
        scheduleNextRun: hasCron ? nextRun(wf.cron!) : null,
      },
      update: {
        name: wf.name,
        description: wf.desc,
        definition: wf.definition as object,
        scheduleCron: wf.cron ?? null,
        scheduleEnabled: hasCron,
      },
    });
    process.stdout.write(hasCron ? "⏰" : "▷");
  }

  const cronCount = workflows.filter(w => w.cron).length;
  const approvalCount = workflows.filter(w => JSON.stringify(w.definition).includes('"user"')).length;
  console.log(`\n  ✓ ${workflows.length} workflows  (${cronCount} CRON-scheduled, ${approvalCount} with human approval)`);
}

async function seedApiKey(): Promise<void> {
  console.log("\n▶ Seeding demo API key…");
  const keyHash = crypto.createHash("sha256").update(DEMO_API_KEY).digest("hex");
  const id = makeId("apikey", "demo-simulator");
  const ctoDid = makeDid("exec-cto");

  await prisma.apiKey.upsert({
    where: { keyHash },
    create: {
      id,
      name: "Demo Simulator Key",
      keyHash,
      keyPrefix: DEMO_API_KEY.slice(0, 8),
      allowedRoutes: ["GET /api/workflows", "POST /api/workflows/[id]/execute"],
      isWorkspaceAdmin: true,
      createdBy: ctoDid,
    },
    update: {
      allowedRoutes: ["GET /api/workflows", "POST /api/workflows/[id]/execute"],
    },
  });
  console.log(`  ✓ API key  (prefix: ${DEMO_API_KEY.slice(0, 8)}…)`);
}

/** Run Prisma database migrations. */
async function runMigrations(): Promise<void> {
  console.log("\n▶ Running Prisma migrations…");
  const controlPlaneDir = path.resolve(__dirname, "../../packages/control-plane");
  try {
    execSync("pnpm exec prisma migrate deploy", {
      cwd: controlPlaneDir,
      stdio: "pipe",
      encoding: "utf-8",
    });
    console.log("  ✓ Migrations applied");
  } catch (err: any) {
    const stdout = typeof err.stdout === "string" ? err.stdout : err.stdout?.toString() || "";
    const stderr = typeof err.stderr === "string" ? err.stderr : err.stderr?.toString() || "";
    const errMsg = stdout + stderr + String(err);
    // If P3005 (schema not empty), database already has the schema — skip migrations
    if (errMsg.includes("P3005")) {
      console.log("  ℹ Database schema already exists — skipping migrations");
    } else {
      console.error("  ✗ Migration failed:", err.message);
      throw err;
    }
  }
}

// ── LiteLLM model registration ───────────────────────────────────────────────

interface LiteLLMModelSpec {
  modelName: string;   // name LiteLLM exposes (what agents reference)
  litellmModel: string; // underlying model string passed to the provider
  apiKey?: string;
}

async function litellmFetch(baseUrl: string, masterKey: string, path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${masterKey}`,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function seedLiteLLM(cfg: DemoConfig): Promise<void> {
  console.log("\n▶ Configuring LiteLLM proxy…");

  const baseUrl = process.env.LITELLM_BASE_URL?.replace(/\/$/, "");
  const masterKey = process.env.LITELLM_MASTER_KEY;

  if (!baseUrl || !masterKey) {
    console.log("  ℹ LITELLM_BASE_URL / LITELLM_MASTER_KEY not set — skipping LiteLLM registration");
    return;
  }

  // Persist connection settings to DB so the UI picks them up
  await setSetting("litellm_base_url", baseUrl);
  const { encryptSecret: enc } = await import("../../packages/control-plane/lib/vault.js");
  await setSetting("litellm_master_key_enc", await enc(masterKey));

  // Health check
  try {
    const health = await fetch(`${baseUrl}/health/liveliness`, {
      headers: { Authorization: `Bearer ${masterKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) {
      console.log("  ⚠ LiteLLM proxy is not reachable — skipping model registration");
      return;
    }
  } catch {
    console.log("  ⚠ LiteLLM proxy is not reachable — skipping model registration");
    return;
  }

  // Resolve API keys: demo-config.json takes precedence, then env vars
  const rawOpenai = cfg.llm?.["openai"]?.apiKey;
  const rawAnthropic = cfg.llm?.["anthropic"]?.apiKey;
  const openaiKey = (rawOpenai && !rawOpenai.startsWith("YOUR_")) ? rawOpenai : process.env.OPENAI_API_KEY;
  const anthropicKey = (rawAnthropic && !rawAnthropic.startsWith("YOUR_")) ? rawAnthropic : process.env.ANTHROPIC_API_KEY;

  const models: LiteLLMModelSpec[] = [
    { modelName: "openai/gpt-4o",         litellmModel: "openai/gpt-4o",         apiKey: openaiKey },
    { modelName: "openai/gpt-4o-mini",    litellmModel: "openai/gpt-4o-mini",    apiKey: openaiKey },
    { modelName: "anthropic/claude-sonnet-4-5", litellmModel: "anthropic/claude-sonnet-4-5", apiKey: anthropicKey },
  ];

  // Add extra models from demo-config.json
  for (const [provider, provCfg] of Object.entries(cfg.llm ?? {})) {
    const apiKey = provCfg.apiKey?.startsWith("YOUR_") ? undefined : provCfg.apiKey || undefined;
    for (const model of provCfg.models ?? []) {
      const name = `${provider}/${model.id}`;
      if (!models.find(m => m.modelName === name)) {
        models.push({ modelName: name, litellmModel: name, apiKey });
      }
    }
  }

  let registered = 0;
  for (const spec of models) {
    const ok = await litellmFetch(baseUrl, masterKey, "/model/new", {
      model_name: spec.modelName,
      litellm_params: {
        model: spec.litellmModel,
        ...(spec.apiKey ? { api_key: spec.apiKey } : {}),
      },
    });
    if (ok) { registered++; process.stdout.write("."); }
    else { process.stdout.write("✗"); }
  }

  const keyless = models.filter(m => !m.apiKey).length;
  console.log(`\n  ✓ ${registered}/${models.length} models registered in LiteLLM proxy`);
  if (keyless > 0) {
    console.log(`  ⚠  ${keyless} model(s) registered without API key — add keys to demo-config.json or set OPENAI_API_KEY / ANTHROPIC_API_KEY`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         VaultysClaw Comprehensive Demo Seed                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const cfg = loadConfig();

  await runMigrations();
  await seedServerIdentity();
  const workspaceSlugToId = await seedWorkspaces();
  const { ownerUserId, ownerDid, execUserIds } = await seedUsers(workspaceSlugToId);
  const modelIdMap = await seedLlmModels(cfg, workspaceSlugToId);
  await seedServiceSettings(cfg);
  await seedChannels(workspaceSlugToId, ownerDid);
  const skillMap = await seedSkills(workspaceSlugToId);
  await seedPolicies(workspaceSlugToId, makeDid("exec-cto"));
  const agentDidMap = await seedAgents(workspaceSlugToId, modelIdMap, skillMap);
  await seedWorkflows(workspaceSlugToId, agentDidMap, ownerDid, ownerUserId);
  await seedApiKey();
  await seedLiteLLM(cfg);

  const userCount = await prisma.user.count();
  const agentCount = await prisma.agent.count();
  const workflowCount = await prisma.workflow.count();
  const channelCount = await prisma.channel.count();

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✓ Demo seed complete!                                       ║");
  console.log("║                                                              ║");
  console.log(`║  Users     : ${String(userCount).padEnd(47)}║`);
  console.log(`║  Agents    : ${String(agentCount).padEnd(47)}║`);
  console.log(`║  Workflows : ${String(workflowCount).padEnd(47)}║`);
  console.log(`║  Channels  : ${String(channelCount).padEnd(47)}║`);
  console.log("║                                                              ║");
  console.log("║  Next steps:                                                 ║");
  console.log("║    1. Add API keys to demo/demo-config.json                  ║");
  console.log("║    2. pnpm demo:start  — connect 30 live agents              ║");
  console.log("║    3. Open /mission-control                                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n✗ Seed failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
