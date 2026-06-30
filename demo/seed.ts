/**
 * VaultysClaw Demo Seeder (Prisma)
 *
 * Seeds realistic demo data into the PostgreSQL control-plane DB:
 * - 8 realms
 * - ~80 users with hierarchy and realm membership
 * - ~500 agents with capability archetypes
 * - peer grants and user grants
 * - activity log entries
 * - geographic location clusters by realm for the world map
 *
 * Usage:
 *   ./demo/seed.sh
 *
 * Notes:
 * - Idempotent for entities keyed by deterministic IDs/DIDs.
 * - Activity logs are re-generated each run for freshness.
 */

import "../packages/control-plane/lib/env-preload";
import { prisma } from "../packages/control-plane/db/client";
import crypto from "crypto";

type Cap =
  | "file_access"
  | "internet_access"
  | "browser_control"
  | "api_call"
  | "mail_send"
  | "code_execution"
  | "system_command";

interface RealmSeed {
  name: string;
  slug: string;
  description: string;
  color: string;
  defaultCaps: Cap[];
}

interface Cluster {
  label: string;
  lat: number;
  lon: number;
}

const REALMS: RealmSeed[] = [
  {
    name: "Engineering",
    slug: "engineering",
    description: "Software development, code review, and testing agents",
    color: "#6366f1",
    defaultCaps: ["code_execution", "file_access", "api_call"],
  },
  {
    name: "Security Operations",
    slug: "security-ops",
    description:
      "Threat detection, vulnerability scanning, and incident response",
    color: "#ef4444",
    defaultCaps: ["internet_access", "api_call", "system_command"],
  },
  {
    name: "DevOps & Infrastructure",
    slug: "devops",
    description: "CI/CD pipelines, deployments, and infrastructure automation",
    color: "#f59e0b",
    defaultCaps: ["code_execution", "system_command", "api_call", "file_access"],
  },
  {
    name: "Finance & Compliance",
    slug: "finance",
    description:
      "Financial reporting, expense analysis, and regulatory compliance",
    color: "#10b981",
    defaultCaps: ["file_access", "api_call"],
  },
  {
    name: "Data & Analytics",
    slug: "data",
    description: "Data pipelines, ML models, and business intelligence agents",
    color: "#8b5cf6",
    defaultCaps: ["code_execution", "file_access", "api_call"],
  },
  {
    name: "Customer Success",
    slug: "customer-success",
    description:
      "Support ticket routing, sentiment analysis, and escalation handling",
    color: "#06b6d4",
    defaultCaps: ["api_call", "mail_send"],
  },
  {
    name: "Legal & Audit",
    slug: "legal",
    description: "Contract review, policy enforcement, and audit trail management",
    color: "#64748b",
    defaultCaps: ["file_access", "api_call"],
  },
  {
    name: "Product",
    slug: "product",
    description: "Feature flags, A/B testing, and user feedback aggregation",
    color: "#f97316",
    defaultCaps: ["api_call", "internet_access"],
  },
];

const REALM_CLUSTERS: Record<string, Cluster[]> = {
  engineering: [
    { label: "San Francisco, US", lat: 37.7749, lon: -122.4194 },
    { label: "Berlin, DE", lat: 52.52, lon: 13.405 },
    { label: "Bangalore, IN", lat: 12.9716, lon: 77.5946 },
  ],
  "security-ops": [
    { label: "London, UK", lat: 51.5072, lon: -0.1276 },
    { label: "Tel Aviv, IL", lat: 32.0853, lon: 34.7818 },
    { label: "Singapore, SG", lat: 1.3521, lon: 103.8198 },
  ],
  devops: [
    { label: "Amsterdam, NL", lat: 52.3676, lon: 4.9041 },
    { label: "Montreal, CA", lat: 45.5017, lon: -73.5673 },
    { label: "Tokyo, JP", lat: 35.6762, lon: 139.6503 },
  ],
  finance: [
    { label: "New York, US", lat: 40.7128, lon: -74.006 },
    { label: "Zurich, CH", lat: 47.3769, lon: 8.5417 },
    { label: "Dubai, AE", lat: 25.2048, lon: 55.2708 },
  ],
  data: [
    { label: "Toronto, CA", lat: 43.6532, lon: -79.3832 },
    { label: "Paris, FR", lat: 48.8566, lon: 2.3522 },
    { label: "Seoul, KR", lat: 37.5665, lon: 126.978 },
  ],
  "customer-success": [
    { label: "Madrid, ES", lat: 40.4168, lon: -3.7038 },
    { label: "Sao Paulo, BR", lat: -23.5505, lon: -46.6333 },
    { label: "Sydney, AU", lat: -33.8688, lon: 151.2093 },
  ],
  legal: [
    { label: "Brussels, BE", lat: 50.8503, lon: 4.3517 },
    { label: "Washington, US", lat: 38.9072, lon: -77.0369 },
    { label: "Geneva, CH", lat: 46.2044, lon: 6.1432 },
  ],
  product: [
    { label: "Austin, US", lat: 30.2672, lon: -97.7431 },
    { label: "Stockholm, SE", lat: 59.3293, lon: 18.0686 },
    { label: "Singapore, SG", lat: 1.3521, lon: 103.8198 },
  ],
};

const AGENT_ARCHETYPES: Record<string, Array<[string, Cap[]]>> = {
  engineering: [
    ["code-review", ["code_execution", "file_access", "api_call"]],
    ["test-runner", ["code_execution", "file_access"]],
    ["docs-writer", ["file_access", "api_call"]],
    ["pr-assistant", ["api_call", "code_execution"]],
    ["dependency-scanner", ["internet_access", "api_call"]],
    ["build-monitor", ["api_call", "system_command"]],
    ["lint-enforcer", ["code_execution", "file_access"]],
    ["coverage-reporter", ["code_execution", "api_call"]],
  ],
  "security-ops": [
    ["vuln-scanner", ["internet_access", "api_call", "system_command"]],
    ["threat-analyzer", ["internet_access", "api_call"]],
    ["incident-responder", ["api_call", "system_command", "mail_send"]],
    ["audit-trail", ["file_access", "api_call"]],
    ["siem-correlator", ["api_call", "internet_access"]],
    ["pen-test-runner", ["internet_access", "system_command"]],
    ["cve-watcher", ["internet_access", "api_call", "mail_send"]],
    ["policy-enforcer", ["api_call", "system_command"]],
  ],
  devops: [
    ["deploy-agent", ["system_command", "api_call", "code_execution"]],
    ["monitoring-agent", ["api_call", "internet_access"]],
    ["log-analyzer", ["file_access", "api_call", "code_execution"]],
    ["alert-handler", ["api_call", "mail_send"]],
    ["backup-agent", ["file_access", "system_command"]],
    ["infra-provisioner", ["system_command", "api_call"]],
    ["rollback-agent", ["system_command", "api_call"]],
    ["healthcheck-agent", ["api_call", "internet_access"]],
  ],
  finance: [
    ["report-generator", ["file_access", "api_call", "code_execution"]],
    ["expense-analyzer", ["file_access", "api_call"]],
    ["compliance-checker", ["api_call", "file_access"]],
    ["fraud-detector", ["api_call", "code_execution"]],
    ["invoice-processor", ["file_access", "api_call"]],
    ["budget-tracker", ["api_call", "file_access"]],
    ["tax-reporter", ["file_access", "api_call", "code_execution"]],
    ["audit-agent", ["file_access", "api_call"]],
  ],
  data: [
    ["pipeline-agent", ["code_execution", "file_access", "api_call"]],
    ["ml-trainer", ["code_execution", "file_access"]],
    ["etl-runner", ["code_execution", "api_call", "file_access"]],
    ["dashboard-updater", ["api_call", "file_access"]],
    ["data-quality-checker", ["code_execution", "file_access"]],
    ["feature-engineer", ["code_execution", "file_access"]],
    ["model-evaluator", ["code_execution", "api_call"]],
    ["insight-reporter", ["api_call", "file_access", "mail_send"]],
  ],
  "customer-success": [
    ["ticket-router", ["api_call", "mail_send"]],
    ["escalation-agent", ["api_call", "mail_send"]],
    ["kb-updater", ["file_access", "api_call"]],
    ["sentiment-analyzer", ["api_call", "code_execution"]],
    ["onboarding-guide", ["api_call", "mail_send"]],
    ["churn-predictor", ["code_execution", "api_call"]],
    ["feedback-aggregator", ["api_call", "internet_access"]],
    ["sla-monitor", ["api_call", "mail_send"]],
  ],
  legal: [
    ["contract-reviewer", ["file_access", "api_call", "code_execution"]],
    ["policy-checker", ["file_access", "api_call"]],
    ["gdpr-agent", ["api_call", "file_access"]],
    ["e-discovery-agent", ["file_access", "code_execution"]],
    ["risk-assessor", ["file_access", "api_call"]],
    ["nda-tracker", ["file_access", "api_call", "mail_send"]],
    ["regulatory-watcher", ["internet_access", "api_call", "mail_send"]],
    ["audit-preparer", ["file_access", "api_call"]],
  ],
  product: [
    ["feature-flag-agent", ["api_call", "code_execution"]],
    ["ab-test-runner", ["api_call", "code_execution"]],
    ["feedback-collector", ["api_call", "internet_access"]],
    ["release-notes-writer", ["api_call", "file_access"]],
    ["roadmap-updater", ["api_call", "file_access"]],
    ["user-research-agent", ["internet_access", "api_call"]],
    ["metrics-reporter", ["api_call", "code_execution"]],
    ["nps-analyzer", ["api_call", "code_execution"]],
  ],
};

const FIRST_NAMES = [
  "Alice", "Bob", "Carlos", "Diana", "Ethan", "Fiona", "George", "Hannah",
  "Ivan", "Julia", "Kevin", "Laura", "Marcus", "Nina", "Omar", "Priya",
  "Quinn", "Rachel", "Samuel", "Tara", "Umar", "Valeria", "William", "Xena",
  "Yusuf", "Zara", "Adrian", "Beatrice", "Colin", "Daphne", "Eduardo",
  "Florence", "Gavin", "Helena", "Igor", "Jasmine", "Kai", "Lena",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
];

const DOMAINS = ["acme.corp", "enterprise.io", "megacorp.com", "infra.tech", "dataworks.ai"];

const ACTIVITY_EVENTS = [
  "agent.registered",
  "agent.connected",
  "agent.disconnected",
  "intent.dispatched",
  "intent.completed",
  "intent.failed",
  "tool.approved",
  "tool.rejected",
  "capability.granted",
  "capability.revoked",
  "user.registered",
  "user.granted_access",
  "delegation.created",
  "realm.agent_added",
  "realm.user_added",
  "policy.updated",
] as const;

const PEER_SKILL_DESCRIPTIONS = [
  "Delegate code review to peer agent",
  "Request threat intelligence from security agent",
  "Forward deployment tasks to infra agent",
  "Enrich report with financial data",
  "Escalate incident to SOC agent",
  "Request ML inference from model agent",
  "Delegate email drafting to comms agent",
  "Sync compliance status with legal agent",
  "Forward user feedback to analytics agent",
  "Request contract summary from legal agent",
  "Trigger pipeline run on data agent",
  "Delegate test execution to CI agent",
];

function hashInt(seed: string): number {
  const hex = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16);
}

function hashFloat(seed: string): number {
  return hashInt(seed) / 0xffffffff;
}

function makeDid(seed: string): string {
  const hex = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `did:vaultys:${hex}`;
}

function makeId(prefix: string, seed: string): string {
  const h = crypto.createHash("sha256").update(`${prefix}:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function pickDet<T>(arr: T[], seed: string): T {
  return arr[hashInt(seed) % arr.length];
}

function sampleDet<T>(arr: T[], count: number, seed: string): T[] {
  const keyed = arr.map((v, i) => ({ v, k: hashInt(`${seed}:${i}`) }));
  keyed.sort((a, b) => a.k - b.k);
  return keyed.slice(0, Math.max(0, Math.min(count, keyed.length))).map((x) => x.v);
}

function daysAgo(days: number, hours = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d;
}

function clusteredLocation(realmSlug: string, seed: string) {
  const clusters = REALM_CLUSTERS[realmSlug] ?? [{ label: "Global", lat: 0, lon: 0 }];
  const cluster = clusters[hashInt(`${seed}:cluster`) % clusters.length];
  const latJitter = (hashFloat(`${seed}:lat`) * 2 - 1) * 0.35;
  const lonJitter = (hashFloat(`${seed}:lon`) * 2 - 1) * 0.35;
  return {
    locationLabel: cluster.label,
    locationLat: Number((cluster.lat + latJitter).toFixed(6)),
    locationLon: Number((cluster.lon + lonJitter).toFixed(6)),
  };
}

async function seedRealms() {
  const existing = await prisma.realm.findMany({ select: { id: true, slug: true, isDefault: true } });
  const map = new Map(existing.map((r) => [r.slug, r.id]));

  for (const realm of REALMS) {
    const id = map.get(realm.slug) ?? makeId("realm", realm.slug);
    await prisma.realm.upsert({
      where: { id },
      create: {
        id,
        name: realm.name,
        slug: realm.slug,
        description: realm.description,
        color: realm.color,
        defaultCapabilities: realm.defaultCaps,
      },
      update: {
        name: realm.name,
        description: realm.description,
        color: realm.color,
        defaultCapabilities: realm.defaultCaps,
      },
    });
    map.set(realm.slug, id);
  }

  const refreshed = await prisma.realm.findMany({ select: { id: true, slug: true, isDefault: true } });
  const defaultRealm = refreshed.find((r) => r.isDefault) ?? refreshed[0];
  return {
    realmIdBySlug: Object.fromEntries(refreshed.map((r) => [r.slug, r.id])) as Record<string, string>,
    defaultRealmId: defaultRealm?.id ?? null,
  };
}

interface UserSeed {
  id: string;
  did: string;
  name: string;
  email: string;
  /** DB access role — one of Owner / Admin / Member. */
  role: "Owner" | "Admin" | "Member";
  /** Seed-only seniority tier, drives demo grant counts. */
  tier: "cto" | "ciso" | "vp" | "lead" | "member";
  reportsTo: string | null;
  description: string;
  realmSlugs: string[];
}

function buildUsers(): UserSeed[] {
  const users: UserSeed[] = [];

  const cto: UserSeed = {
    id: makeId("user", "cto"),
    did: makeDid("user-cto-chief"),
    name: "Alexandra Chen",
    email: `a.chen@${DOMAINS[0]}`,
    role: "Owner",
    tier: "cto",
    reportsTo: null,
    description: "Chief Technology Officer - owns the entire AI agent platform",
    realmSlugs: REALMS.map((r) => r.slug),
  };

  const ciso: UserSeed = {
    id: makeId("user", "ciso"),
    did: makeDid("user-ciso-chief"),
    name: "Marcus Webb",
    email: `m.webb@${DOMAINS[0]}`,
    role: "Admin",
    tier: "ciso",
    reportsTo: cto.id,
    description: "Chief Information Security Officer",
    realmSlugs: ["security-ops", "legal", "devops"],
  };

  users.push(cto, ciso);

  const vpBySlug: Record<string, UserSeed> = {};
  const vpDefs: Array<{ slug: string; name: string; title: string }> = [
    { slug: "engineering", name: "James Okonkwo", title: "VP Engineering" },
    { slug: "security-ops", name: "Sarah Lindqvist", title: "VP Security" },
    { slug: "devops", name: "Raj Patel", title: "VP Infrastructure" },
    { slug: "finance", name: "Elena Romero", title: "VP Finance" },
    { slug: "data", name: "David Park", title: "VP Data & AI" },
    { slug: "customer-success", name: "Amara Diallo", title: "VP Customer Success" },
    { slug: "legal", name: "Thomas Bergmann", title: "VP Legal" },
    { slug: "product", name: "Yuki Tanaka", title: "VP Product" },
  ];

  for (const vp of vpDefs) {
    const id = makeId("user", `vp:${vp.slug}`);
    const u: UserSeed = {
      id,
      did: makeDid(`user-vp-${vp.slug}`),
      name: vp.name,
      email: `${vp.name.toLowerCase().replace(/\s+/g, ".")}@${DOMAINS[0]}`,
      role: "Admin",
      tier: "vp",
      reportsTo: vp.slug === "security-ops" || vp.slug === "legal" ? ciso.id : cto.id,
      description: `${vp.title} - manages all ${vp.slug} agents and team`,
      realmSlugs: [vp.slug],
    };
    vpBySlug[vp.slug] = u;
    users.push(u);
  }

  for (const realm of REALMS) {
    const vp = vpBySlug[realm.slug];
    const leads: UserSeed[] = [];

    for (let i = 0; i < 2; i++) {
      const first = pickDet(FIRST_NAMES, `${realm.slug}:lead:${i}:f`);
      const last = pickDet(LAST_NAMES, `${realm.slug}:lead:${i}:l`);
      const id = makeId("user", `lead:${realm.slug}:${i}`);
      const u: UserSeed = {
        id,
        did: makeDid(`user-lead-${realm.slug}-${i}`),
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${pickDet(DOMAINS, `${realm.slug}:lead:${i}:d`)}`,
        role: "Member",
        tier: "lead",
        reportsTo: vp.id,
        description: `Team lead for ${realm.name} agents`,
        realmSlugs: [realm.slug],
      };
      leads.push(u);
      users.push(u);
    }

    for (let i = 0; i < 8; i++) {
      const first = pickDet(FIRST_NAMES, `${realm.slug}:ic:${i}:f`);
      const last = pickDet(LAST_NAMES, `${realm.slug}:ic:${i}:l`);
      const manager = leads[i % leads.length] ?? vp;
      const u: UserSeed = {
        id: makeId("user", `ic:${realm.slug}:${i}`),
        did: makeDid(`user-ic-${realm.slug}-${i}`),
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${pickDet(DOMAINS, `${realm.slug}:ic:${i}:d`)}`,
        role: "Member",
        tier: "member",
        reportsTo: manager.id,
        description: `${realm.name} engineer / analyst`,
        realmSlugs: [realm.slug],
      };
      users.push(u);
    }
  }

  return users;
}

interface AgentSeed {
  did: string;
  name: string;
  capabilities: Cap[];
  realmSlug: string;
  registeredAt: Date;
  lastSeen: Date;
}

function buildAgents(): AgentSeed[] {
  const agents: AgentSeed[] = [];
  for (const realm of REALMS) {
    const archetypes = AGENT_ARCHETYPES[realm.slug] ?? [];
    const count = 60;
    for (let i = 0; i < count; i++) {
      const [prefix, caps] = archetypes[i % archetypes.length];
      const num = Math.floor(i / archetypes.length) + 1;
      const name = `${realm.slug}-${prefix}-${String(num).padStart(2, "0")}`;
      const registeredDaysAgo = 1 + (hashInt(`${name}:reg`) % 180);
      const lastSeenDaysAgo = hashInt(`${name}:seen`) % registeredDaysAgo;
      agents.push({
        did: makeDid(`agent-${name}`),
        name,
        capabilities: caps,
        realmSlug: realm.slug,
        registeredAt: daysAgo(registeredDaysAgo, hashInt(`${name}:regH`) % 24),
        lastSeen: daysAgo(lastSeenDaysAgo, hashInt(`${name}:seenH`) % 24),
      });
    }
  }
  return agents;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Configure packages/control-plane/.env or export DATABASE_URL.");
  }

  console.log("Seeding demo data with Prisma...");

  const { realmIdBySlug, defaultRealmId } = await seedRealms();
  console.log(`  -> realms ready (${Object.keys(realmIdBySlug).length})`);

  const users = buildUsers();
  for (const u of users) {
    const primarySlug = u.realmSlugs[0] ?? "engineering";
    const loc = clusteredLocation(primarySlug, u.did);
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        did: u.did,
        name: u.name,
        email: u.email,
        role: u.role,
        reportsTo: u.reportsTo,
        description: u.description,
        locationLat: loc.locationLat,
        locationLon: loc.locationLon,
        locationLabel: loc.locationLabel,
      },
      update: {
        did: u.did,
        name: u.name,
        email: u.email,
        role: u.role,
        reportsTo: u.reportsTo,
        description: u.description,
        locationLat: loc.locationLat,
        locationLon: loc.locationLon,
        locationLabel: loc.locationLabel,
      },
    });

    for (let i = 0; i < u.realmSlugs.length; i++) {
      const realmId = realmIdBySlug[u.realmSlugs[i]];
      if (!realmId) continue;
      await prisma.userRealm.upsert({
        where: { userId_realmId: { userId: u.id, realmId } },
        create: { userId: u.id, realmId, isPrimary: i === 0 },
        update: { isPrimary: i === 0 },
      });
    }

    if (defaultRealmId) {
      await prisma.userRealm.upsert({
        where: { userId_realmId: { userId: u.id, realmId: defaultRealmId } },
        create: { userId: u.id, realmId: defaultRealmId, isPrimary: false },
        update: {},
      });
    }
  }
  console.log(`  -> users ready (${users.length})`);

  const agents = buildAgents();
  for (let idx = 0; idx < agents.length; idx++) {
    const a = agents[idx];
    const loc = clusteredLocation(a.realmSlug, a.did);

    await prisma.agent.upsert({
      where: { did: a.did },
      create: {
        did: a.did,
        name: a.name,
        capabilities: a.capabilities,
        registeredAt: a.registeredAt,
        lastSeen: a.lastSeen,
        locationLat: loc.locationLat,
        locationLon: loc.locationLon,
        locationLabel: loc.locationLabel,
      },
      update: {
        name: a.name,
        capabilities: a.capabilities,
        registeredAt: a.registeredAt,
        lastSeen: a.lastSeen,
        locationLat: loc.locationLat,
        locationLon: loc.locationLon,
        locationLabel: loc.locationLabel,
      },
    });

    const primaryRealmId = realmIdBySlug[a.realmSlug];
    if (primaryRealmId) {
      await prisma.agentRealm.upsert({
        where: { agentDid_realmId: { agentDid: a.did, realmId: primaryRealmId } },
        create: { agentDid: a.did, realmId: primaryRealmId, isPrimary: true },
        update: { isPrimary: true },
      });
    }

    if (defaultRealmId) {
      await prisma.agentRealm.upsert({
        where: { agentDid_realmId: { agentDid: a.did, realmId: defaultRealmId } },
        create: { agentDid: a.did, realmId: defaultRealmId, isPrimary: false },
        update: {},
      });
    }

    if (idx % 5 === 0) {
      const other = REALMS.find((r) => r.slug !== a.realmSlug && (hashInt(`${a.did}:xrealm`) % 7) === REALMS.indexOf(r));
      if (other) {
        const otherId = realmIdBySlug[other.slug];
        if (otherId) {
          await prisma.agentRealm.upsert({
            where: { agentDid_realmId: { agentDid: a.did, realmId: otherId } },
            create: { agentDid: a.did, realmId: otherId, isPrimary: false },
            update: {},
          });
        }
      }
    }
  }
  console.log(`  -> agents ready (${agents.length})`);

  const agentsByRealm = agents.reduce<Record<string, AgentSeed[]>>((acc, a) => {
    (acc[a.realmSlug] = acc[a.realmSlug] ?? []).push(a);
    return acc;
  }, {});

  const peerGrants: Array<{
    id: string;
    sourceDid: string;
    targetDid: string;
    targetName: string;
    skillDescription: string;
    capabilities: string[];
    expiresAt: Date;
    createdAt: Date;
  }> = [];

  for (const a of agents) {
    const sameRealm = (agentsByRealm[a.realmSlug] ?? []).filter((x) => x.did !== a.did);
    const samePeers = sampleDet(sameRealm, 2 + (hashInt(`${a.did}:peerCount`) % 2), `${a.did}:same`);

    samePeers.forEach((target, i) => {
      const caps = sampleDet(target.capabilities, 1 + (hashInt(`${a.did}:${target.did}:caps`) % Math.min(2, target.capabilities.length)), `${a.did}:${target.did}:capsList`);
      peerGrants.push({
        id: makeId("peer-grant", `${a.did}:${target.did}:${i}`),
        sourceDid: a.did,
        targetDid: target.did,
        targetName: target.name,
        skillDescription: pickDet(PEER_SKILL_DESCRIPTIONS, `${a.did}:${target.did}:desc`),
        capabilities: caps,
        expiresAt: daysAgo(-(30 + (hashInt(`${a.did}:${target.did}:exp`) % 365))),
        createdAt: daysAgo(hashInt(`${a.did}:${target.did}:created`) % 90),
      });
    });

    if (hashInt(`${a.did}:cross`) % 7 === 0) {
      const otherRealm = REALMS[(hashInt(`${a.did}:otherRealm`) % REALMS.length)];
      if (otherRealm.slug !== a.realmSlug) {
        const candidates = agentsByRealm[otherRealm.slug] ?? [];
        const target = candidates[hashInt(`${a.did}:crossTarget`) % Math.max(1, candidates.length)];
        if (target) {
          peerGrants.push({
            id: makeId("peer-grant", `cross:${a.did}:${target.did}`),
            sourceDid: a.did,
            targetDid: target.did,
            targetName: target.name,
            skillDescription: pickDet(PEER_SKILL_DESCRIPTIONS, `cross:${a.did}:${target.did}`),
            capabilities: sampleDet(target.capabilities, 1, `crossCaps:${a.did}:${target.did}`),
            expiresAt: daysAgo(-(30 + (hashInt(`cross:${a.did}:${target.did}:exp`) % 180))),
            createdAt: daysAgo(hashInt(`cross:${a.did}:${target.did}:created`) % 60),
          });
        }
      }
    }
  }

  await prisma.agentPeerGrant.createMany({ data: peerGrants, skipDuplicates: true });
  console.log(`  -> peer grants ready (${peerGrants.length})`);

  const userGrants: Array<{
    id: string;
    userDid: string;
    agentDid: string;
    capabilities: string[];
    grantedBy: string;
    expiresAt: Date;
    createdAt: Date;
  }> = [];

  const usersByDid = new Map(users.map((u) => [u.did, u]));

  for (const u of users) {
    const primarySlug = u.realmSlugs[0];
    const realmAgents = agentsByRealm[primarySlug] ?? [];
    const count =
      u.tier === "vp" || u.tier === "cto" || u.tier === "ciso"
        ? 5
        : u.tier === "lead"
          ? 3
          : 2;

    const targets = sampleDet(realmAgents, count, `${u.did}:grantTargets`);
    targets.forEach((agent, i) => {
      const caps = sampleDet(agent.capabilities, 1 + (hashInt(`${u.did}:${agent.did}:gc`) % Math.min(2, agent.capabilities.length)), `${u.did}:${agent.did}:caps`);
      userGrants.push({
        id: makeId("user-grant", `${u.did}:${agent.did}:${i}`),
        userDid: u.did,
        agentDid: agent.did,
        capabilities: caps,
        grantedBy: usersByDid.get(u.reportsTo ?? "")?.did ?? u.did,
        expiresAt: daysAgo(-(30 + (hashInt(`${u.did}:${agent.did}:exp`) % 180))),
        createdAt: daysAgo(hashInt(`${u.did}:${agent.did}:created`) % 90),
      });
    });
  }

  await prisma.userGrant.createMany({ data: userGrants, skipDuplicates: true });
  console.log(`  -> user grants ready (${userGrants.length})`);

  await prisma.activityLog.deleteMany({
    where: { details: { contains: '"seed":"demo-prisma"' } },
  });

  const activityRows: Array<{
    event: string;
    agentDid: string;
    agentName: string;
    details: string;
    createdAt: Date;
  }> = [];

  for (let i = 0; i < 2000; i++) {
    const agent = agents[i % agents.length];
    const event = ACTIVITY_EVENTS[hashInt(`activity:event:${i}`) % ACTIVITY_EVENTS.length];

    const detailObj: Record<string, unknown> = {
      seed: "demo-prisma",
      idx: i,
      realm: agent.realmSlug,
    };

    if (event === "intent.dispatched") {
      detailObj.intent = pickDet(["summarize", "analyze", "deploy", "scan", "report", "validate"], `intent:${i}`);
      detailObj.status = "queued";
    } else if (event === "intent.completed") {
      detailObj.durationMs = 200 + (hashInt(`duration:${i}`) % 7800);
      detailObj.toolCalls = 1 + (hashInt(`tools:${i}`) % 6);
    } else if (event === "tool.approved" || event === "tool.rejected") {
      detailObj.tool = pickDet(["http_request", "shell_exec", "file_write", "code_run", "send_email"], `tool:${i}`);
    } else if (event === "capability.granted") {
      detailObj.capability = pickDet(
        [
          "file_access",
          "internet_access",
          "browser_control",
          "api_call",
          "mail_send",
          "code_execution",
          "system_command",
        ],
        `cap:${i}`
      );
    }

    activityRows.push({
      event,
      agentDid: agent.did,
      agentName: agent.name,
      details: JSON.stringify(detailObj),
      createdAt: daysAgo(hashInt(`activity:days:${i}`) % 30, hashInt(`activity:hours:${i}`) % 24),
    });
  }

  await prisma.activityLog.createMany({ data: activityRows });
  console.log("  -> activity log ready (2000 rows)");

  console.log("\nDemo seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
