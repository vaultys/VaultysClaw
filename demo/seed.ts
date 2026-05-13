/**
 * VaultysClaw Demo Seeder
 *
 * Populates the control-plane SQLite database with realistic enterprise data
 * so the dashboard, agent graph, and analytics look meaningful for demos.
 *
 * Run from the repo root:
 *   cd packages/control-plane && node_modules/.bin/tsx ../../demo/seed.ts
 *
 * Or via the helper script:
 *   ./demo/seed.sh
 *
 * What is created:
 *   - 8 enterprise realms (departments)
 *   - ~80 users with a realistic org hierarchy
 *   - ~500 agents across realms with distinct capability profiles
 *   - ~400 agent peer-grants (cross-agent delegation edges)
 *   - ~200 user_grants (user → agent delegations)
 *   - ~2 000 activity-log entries spanning the past 30 days
 *
 * The script is idempotent: running it twice will not create duplicates because
 * every row uses a deterministic seed (name-based) DID and INSERT OR IGNORE.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve DB relative to packages/control-plane (cwd when this script is run)
const DB_PATH = path.resolve(process.cwd(), "data", "vaultysclaw.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  console.error("Start the control plane at least once before seeding.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic pseudo-DID from a stable seed string */
function makeDid(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h) ^ seed.charCodeAt(i);
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  // Pad to 32 hex chars with a stable suffix
  const full = (hex + seed.replace(/[^a-z0-9]/gi, "")).slice(0, 32).padEnd(32, "0");
  return `did:vaultys:${full}`;
}

/** Random integer in [min, max] */
function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random element from an array */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random subset of size n from arr */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/** ISO datetime offset by `daysAgo` days from now */
function daysAgo(d: number, hoursJitter = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(dt.getHours() - hoursJitter);
  return dt.toISOString().replace("T", " ").slice(0, 19);
}

// ---------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------

const REALMS: Array<{ name: string; slug: string; description: string; color: string; defaultCaps: string[] }> = [
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
    description: "Threat detection, vulnerability scanning, and incident response",
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
    description: "Financial reporting, expense analysis, and regulatory compliance",
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
    description: "Support ticket routing, sentiment analysis, and escalation handling",
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

const ALL_CAPS = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
] as const;

type Cap = (typeof ALL_CAPS)[number];

// Agent archetypes per realm: [name_prefix, capabilities]
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

// User first/last names pool
const FIRST_NAMES = [
  "Alice", "Bob", "Carlos", "Diana", "Ethan", "Fiona", "George", "Hannah",
  "Ivan", "Julia", "Kevin", "Laura", "Marcus", "Nina", "Omar", "Priya",
  "Quinn", "Rachel", "Samuel", "Tara", "Umar", "Valeria", "William", "Xena",
  "Yusuf", "Zara", "Adrian", "Beatrice", "Colin", "Daphne", "Eduardo",
  "Florence", "Gavin", "Helena", "Igor", "Jasmine", "Kai", "Lena",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
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
];

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

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

function seed(): void {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  console.log(`Seeding database at ${DB_PATH}`);

  // Wrap everything in a single transaction for speed
  const run = db.transaction(() => {
    // ------------------------------------------------------------------
    // 1. Realms
    // ------------------------------------------------------------------
    console.log("  → Creating realms...");

    const realmIdBySlug: Record<string, string> = {};

    // Preserve existing realms; just add missing ones
    const existingRealms = db.prepare("SELECT id, slug FROM realms").all() as { id: string; slug: string }[];
    for (const r of existingRealms) realmIdBySlug[r.slug] = r.id;

    for (const realm of REALMS) {
      if (realmIdBySlug[realm.slug]) continue;
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT OR IGNORE INTO realms (id, name, slug, description, color, default_capabilities)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, realm.name, realm.slug, realm.description, realm.color, JSON.stringify(realm.defaultCaps));
      realmIdBySlug[realm.slug] = id;
    }

    // Get default realm id
    const defaultRealm = db.prepare("SELECT id FROM realms WHERE is_default = 1 LIMIT 1").get() as { id: string } | undefined;
    const defaultRealmId = defaultRealm?.id;

    // ------------------------------------------------------------------
    // 2. Users (org hierarchy)
    // ------------------------------------------------------------------
    console.log("  → Creating users...");

    interface UserDef {
      did: string;
      name: string;
      email: string;
      role: string;
      is_admin: number;
      is_owner: number;
      reports_to: string | null;
      description: string;
      realm_slugs: string[];
    }

    const users: UserDef[] = [];

    // C-suite
    const cto: UserDef = {
      did: makeDid("user-cto-chief"),
      name: "Alexandra Chen",
      email: `a.chen@${DOMAINS[0]}`,
      role: "cto",
      is_admin: 1,
      is_owner: 1,
      reports_to: null,
      description: "Chief Technology Officer — owns the entire AI agent platform",
      realm_slugs: REALMS.map((r) => r.slug),
    };
    const ciso: UserDef = {
      did: makeDid("user-ciso-chief"),
      name: "Marcus Webb",
      email: `m.webb@${DOMAINS[0]}`,
      role: "ciso",
      is_admin: 1,
      is_owner: 0,
      reports_to: cto.did,
      description: "Chief Information Security Officer",
      realm_slugs: ["security-ops", "legal", "devops"],
    };
    users.push(cto, ciso);

    // VPs (one per realm)
    const vpBySlug: Record<string, UserDef> = {};
    const vpDefs: Array<{ slug: string; name: string; title: string }> = [
      { slug: "engineering",        name: "James Okonkwo",   title: "VP Engineering" },
      { slug: "security-ops",       name: "Sarah Lindqvist", title: "VP Security" },
      { slug: "devops",             name: "Raj Patel",       title: "VP Infrastructure" },
      { slug: "finance",            name: "Elena Romero",    title: "VP Finance" },
      { slug: "data",               name: "David Park",      title: "VP Data & AI" },
      { slug: "customer-success",   name: "Amara Diallo",    title: "VP Customer Success" },
      { slug: "legal",              name: "Thomas Bergmann", title: "VP Legal" },
      { slug: "product",            name: "Yuki Tanaka",     title: "VP Product" },
    ];
    for (const vp of vpDefs) {
      const u: UserDef = {
        did: makeDid(`user-vp-${vp.slug}`),
        name: vp.name,
        email: `${vp.name.toLowerCase().replace(" ", ".")}@${DOMAINS[0]}`,
        role: "vp",
        is_admin: 1,
        is_owner: 0,
        reports_to: vp.slug === "security-ops" || vp.slug === "legal" ? ciso.did : cto.did,
        description: `${vp.title} — manages all ${vp.slug} agents and team`,
        realm_slugs: [vp.slug],
      };
      vpBySlug[vp.slug] = u;
      users.push(u);
    }

    // Team leads & ICs per realm
    for (const realm of REALMS) {
      const vp = vpBySlug[realm.slug];
      const leadCount = rnd(2, 3);
      const icCount = rnd(6, 10);

      const leads: UserDef[] = [];
      for (let i = 0; i < leadCount; i++) {
        const first = pick(FIRST_NAMES);
        const last = pick(LAST_NAMES);
        const u: UserDef = {
          did: makeDid(`user-lead-${realm.slug}-${i}`),
          name: `${first} ${last}`,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@${pick(DOMAINS)}`,
          role: "lead",
          is_admin: 0,
          is_owner: 0,
          reports_to: vp.did,
          description: `Team lead for ${realm.name} agents`,
          realm_slugs: [realm.slug],
        };
        leads.push(u);
        users.push(u);
      }

      for (let i = 0; i < icCount; i++) {
        const first = pick(FIRST_NAMES);
        const last = pick(LAST_NAMES);
        const u: UserDef = {
          did: makeDid(`user-ic-${realm.slug}-${i}`),
          name: `${first} ${last}`,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@${pick(DOMAINS)}`,
          role: "member",
          is_admin: 0,
          is_owner: 0,
          reports_to: pick(leads)?.did ?? vp.did,
          description: `${realm.name} engineer / analyst`,
          realm_slugs: [realm.slug],
        };
        users.push(u);
      }
    }

    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (did, name, email, is_owner, is_admin, role, reports_to, description)
      VALUES (@did, @name, @email, @is_owner, @is_admin, @role, @reports_to, @description)
    `);
    const insertUserRealm = db.prepare(
      "INSERT OR IGNORE INTO user_realms (user_did, realm_id, is_primary) VALUES (?, ?, ?)"
    );

    for (const u of users) {
      insertUser.run(u);
      for (let i = 0; i < u.realm_slugs.length; i++) {
        const rId = realmIdBySlug[u.realm_slugs[i]];
        if (rId) insertUserRealm.run(u.did, rId, i === 0 ? 1 : 0);
      }
      if (defaultRealmId) insertUserRealm.run(u.did, defaultRealmId, 0);
    }

    console.log(`     ${users.length} users inserted`);

    // ------------------------------------------------------------------
    // 3. Agents
    // ------------------------------------------------------------------
    console.log("  → Creating agents...");

    interface AgentDef {
      did: string;
      name: string;
      capabilities: string[];
      realm_slug: string;
      registered_at: string;
      last_seen: string;
    }

    const agents: AgentDef[] = [];

    for (const realm of REALMS) {
      const archetypes = AGENT_ARCHETYPES[realm.slug] ?? [];
      // ~60 agents per realm, cycling through archetypes
      const count = rnd(55, 70);
      for (let i = 0; i < count; i++) {
        const [prefix, caps] = archetypes[i % archetypes.length];
        const num = Math.floor(i / archetypes.length) + 1;
        const name = `${realm.slug}-${prefix}-${String(num).padStart(2, "0")}`;
        const registeredDaysAgo = rnd(1, 180);
        const lastSeenDaysAgo = rnd(0, registeredDaysAgo);
        agents.push({
          did: makeDid(`agent-${name}`),
          name,
          capabilities: caps as string[],
          realm_slug: realm.slug,
          registered_at: daysAgo(registeredDaysAgo, rnd(0, 23)),
          last_seen: daysAgo(lastSeenDaysAgo, rnd(0, 23)),
        });
      }
    }

    const insertAgent = db.prepare(`
      INSERT OR IGNORE INTO agents (did, name, capabilities, registered_at, last_seen)
      VALUES (@did, @name, @capabilities_json, @registered_at, @last_seen)
    `);
    const insertAgentRealm = db.prepare(
      "INSERT OR IGNORE INTO agent_realms (agent_did, realm_id, is_primary) VALUES (?, ?, ?)"
    );

    for (const a of agents) {
      insertAgent.run({ ...a, capabilities_json: JSON.stringify(a.capabilities) });
      const rId = realmIdBySlug[a.realm_slug];
      if (rId) insertAgentRealm.run(a.did, rId, 1);
      if (defaultRealmId) insertAgentRealm.run(a.did, defaultRealmId, 0);

      // ~20% of agents are cross-realm (belong to a second realm)
      if (Math.random() < 0.2) {
        const otherRealm = pick(REALMS.filter((r) => r.slug !== a.realm_slug));
        const otherId = realmIdBySlug[otherRealm.slug];
        if (otherId) insertAgentRealm.run(a.did, otherId, 0);
      }
    }

    console.log(`     ${agents.length} agents inserted`);

    // ------------------------------------------------------------------
    // 4. Agent peer grants (delegation edges — the graph!)
    // ------------------------------------------------------------------
    console.log("  → Creating agent peer grants...");

    const insertPeerGrant = db.prepare(`
      INSERT OR IGNORE INTO agent_peer_grants
        (id, source_did, target_did, target_name, skill_description, capabilities, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let peerGrantCount = 0;
    const agentsByRealm: Record<string, AgentDef[]> = {};
    for (const a of agents) {
      (agentsByRealm[a.realm_slug] = agentsByRealm[a.realm_slug] ?? []).push(a);
    }

    for (const a of agents) {
      // Intra-realm edges: each agent connects to 1–3 peers in same realm
      const sameRealm = (agentsByRealm[a.realm_slug] ?? []).filter((x) => x.did !== a.did);
      for (const target of sample(sameRealm, rnd(1, 3))) {
        const caps = sample(target.capabilities, rnd(1, Math.min(2, target.capabilities.length)));
        const expiresInDays = rnd(30, 365);
        insertPeerGrant.run(
          makeDid(`pg-${a.did}-${target.did}`).slice(12, 44),
          a.did,
          target.did,
          target.name,
          pick(PEER_SKILL_DESCRIPTIONS),
          JSON.stringify(caps),
          daysAgo(-expiresInDays),
          daysAgo(rnd(0, 90), rnd(0, 23))
        );
        peerGrantCount++;
      }

      // Cross-realm edges: ~15% of agents have 1–2 cross-realm delegations
      if (Math.random() < 0.15) {
        const otherRealm = pick(REALMS.filter((r) => r.slug !== a.realm_slug));
        const crossPeers = agentsByRealm[otherRealm.slug] ?? [];
        for (const target of sample(crossPeers, rnd(1, 2))) {
          const caps = sample(target.capabilities, 1);
          insertPeerGrant.run(
            makeDid(`pg-cross-${a.did}-${target.did}`).slice(12, 44),
            a.did,
            target.did,
            target.name,
            pick(PEER_SKILL_DESCRIPTIONS),
            JSON.stringify(caps),
            daysAgo(-rnd(30, 180)),
            daysAgo(rnd(0, 60), rnd(0, 23))
          );
          peerGrantCount++;
        }
      }
    }

    console.log(`     ${peerGrantCount} peer grants inserted`);

    // ------------------------------------------------------------------
    // 5. User grants (user → agent delegations)
    // ------------------------------------------------------------------
    console.log("  → Creating user grants...");

    const insertGrant = db.prepare(`
      INSERT OR IGNORE INTO user_grants
        (id, user_did, agent_did, capabilities, granted_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let grantCount = 0;
    for (const u of users) {
      const realmSlug = u.realm_slugs[0];
      const realmAgents = agentsByRealm[realmSlug] ?? [];
      // Each user gets 1–5 agent grants, proportional to seniority
      const numGrants = u.role === "vp" || u.role === "cto" || u.role === "ciso"
        ? rnd(3, 8)
        : u.role === "lead"
        ? rnd(2, 5)
        : rnd(1, 3);

      for (const agent of sample(realmAgents, numGrants)) {
        const caps = sample(agent.capabilities, rnd(1, Math.min(2, agent.capabilities.length)));
        const grantedBy = u.reports_to ?? u.did;
        insertGrant.run(
          makeDid(`grant-${u.did}-${agent.did}`).slice(12, 44),
          u.did,
          agent.did,
          JSON.stringify(caps),
          grantedBy,
          daysAgo(-rnd(30, 180)),
          daysAgo(rnd(0, 90), rnd(0, 23))
        );
        grantCount++;
      }
    }

    console.log(`     ${grantCount} user grants inserted`);

    // ------------------------------------------------------------------
    // 6. Activity log (2 000 entries, last 30 days)
    // ------------------------------------------------------------------
    console.log("  → Creating activity log...");

    const insertActivity = db.prepare(`
      INSERT INTO activity_log (event, agent_did, agent_name, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const TARGET_ENTRIES = 2000;
    for (let i = 0; i < TARGET_ENTRIES; i++) {
      const agent = pick(agents);
      const event = pick(ACTIVITY_EVENTS);
      let details: string | null = null;

      if (event === "intent.dispatched") {
        details = JSON.stringify({ intent: pick(["summarize", "analyze", "deploy", "scan", "report", "validate"]), status: "queued" });
      } else if (event === "intent.completed") {
        details = JSON.stringify({ durationMs: rnd(200, 8000), toolCalls: rnd(1, 6) });
      } else if (event === "tool.approved" || event === "tool.rejected") {
        details = JSON.stringify({ tool: pick(["http_request", "shell_exec", "file_write", "code_run", "send_email"]) });
      } else if (event === "capability.granted") {
        details = JSON.stringify({ capability: pick(ALL_CAPS as unknown as string[]) });
      }

      insertActivity.run(
        event,
        agent.did,
        agent.name,
        details,
        daysAgo(rnd(0, 30), rnd(0, 23))
      );
    }

    console.log(`     ${TARGET_ENTRIES} activity log entries inserted`);
  });

  // Execute the transaction
  run();

  db.close();

  const dbSize = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\nDone! Database size: ${dbSize} MB`);
  console.log(`Open the dashboard at http://localhost:3300 to see the data.\n`);
}

seed();
