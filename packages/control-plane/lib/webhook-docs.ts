/**
 * Webhook documentation data — the single source of truth for the admin webhook
 * docs page. Example payloads are produced by feeding representative sample data
 * through the very same builders used at the emission sites
 * (`lib/webhook-payloads.ts`), so the documented shapes never drift from what is
 * actually delivered.
 */
import { WEBHOOK_EVENTS, type WebhookEventDef } from "@vaultysclaw/shared";
import {
  workspacePayload,
  agentPayload,
  modelPayload,
  userPayload,
  knowledgePayload,
  skillPayload,
  workflowPayload,
} from "./webhook-payloads";

// ── Representative sample domain objects ──────────────────────────────────────

const sampleWorkspace = {
  id: "ws_9f3a2b",
  name: "Acme Research",
  slug: "acme-research",
  description: "Workspace for the research team",
  color: "#6366f1",
  isDefault: false,
  createdAt: "2026-07-16T09:24:00.000Z",
};

const sampleAgent = {
  did: "did:key:z6Mkabcd…",
  name: "research-assistant",
  capabilities: ["web_search", "code_execution"],
  status: "online",
  registeredAt: "2026-07-16T09:20:00.000Z",
  lastSeen: "2026-07-16T09:25:00.000Z",
};

const sampleModel = {
  id: "mdl_1a2b3c",
  name: "GPT-4o (Acme)",
  description: "Primary reasoning model",
  provider: "openai",
  modelId: "gpt-4o",
  baseUrl: "https://api.openai.com/v1",
  status: "active",
  createdAt: "2026-07-16T09:00:00.000Z",
  updatedAt: "2026-07-16T09:10:00.000Z",
};

const sampleUser = {
  id: "usr_5e6f7a",
  did: "did:key:z6MkuserXYZ…",
  name: "Alex Doe",
  email: "alex@acme.example",
  role: "Member",
  reportsTo: null,
  description: null,
};

const sampleKnowledge = {
  id: "kn_8b9c0d",
  name: "Product Docs",
  workspaceId: sampleWorkspace.id,
  agentDid: sampleAgent.did,
  sourceType: "web",
  status: "ready",
  createdAt: "2026-07-16T09:05:00.000Z",
};

const sampleSkill = {
  id: "skl_2d3e4f",
  name: "summarize",
  description: "Summarize long documents",
  version: "1.2.0",
  icon: "📝",
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:30:00.000Z",
};

const sampleWorkflow = {
  workflowId: "wf_6a7b8c",
  workflowName: "Nightly ingest",
  runId: "run_3f4a5b",
};

// ── event type → example payload (mirrors the emission sites) ─────────────────

const EXAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  "user.login": userPayload(sampleUser),
  "user.logout": {
    id: sampleUser.id,
    did: sampleUser.did,
    name: sampleUser.name,
    email: sampleUser.email,
    role: sampleUser.role,
  },
  "user.created": userPayload(sampleUser),
  "user.updated": userPayload(sampleUser),
  "user.deleted": userPayload(sampleUser),
  "user.joined": userPayload(sampleUser),

  "agent.approval_requested": {
    did: sampleAgent.did,
    name: sampleAgent.name,
    capabilities: sampleAgent.capabilities,
    registrationId: "reg_7c8d9e",
  },
  "agent.created": {
    did: sampleAgent.did,
    name: sampleAgent.name,
    capabilities: sampleAgent.capabilities,
  },
  "agent.updated": agentPayload(sampleAgent),
  "agent.deleted": agentPayload(sampleAgent),

  "workspace.created": workspacePayload(sampleWorkspace),
  "workspace.updated": workspacePayload(sampleWorkspace),
  "workspace.deleted": { id: sampleWorkspace.id, name: sampleWorkspace.name },

  "model.created": modelPayload(sampleModel),
  "model.updated": modelPayload(sampleModel),
  "model.deleted": modelPayload(sampleModel),

  "knowledge.created": knowledgePayload(sampleKnowledge),
  "knowledge.deleted": knowledgePayload(sampleKnowledge),

  "skill.created": skillPayload(sampleSkill),
  "skill.updated": skillPayload(sampleSkill),
  "skill.deleted": skillPayload(sampleSkill),

  "workflow.succeeded": workflowPayload(sampleWorkflow),
  "workflow.failed": workflowPayload({
    ...sampleWorkflow,
    error: "Node 'fetch' timed out after 30s",
  }),
};

export interface WebhookEventDoc extends WebhookEventDef {
  /** Full example request body ({ event, occurredAt, data }). */
  exampleBody: string;
}

/** Build the documented events, grouped by catalog group, with example bodies. */
export function buildWebhookEventDocs(): {
  group: string;
  events: WebhookEventDoc[];
}[] {
  const groups: { group: string; events: WebhookEventDoc[] }[] = [];
  for (const def of WEBHOOK_EVENTS) {
    const data = EXAMPLE_PAYLOADS[def.type] ?? {};
    const exampleBody = JSON.stringify(
      {
        event: def.type,
        occurredAt: "2026-07-16T09:24:00.000Z",
        data,
      },
      null,
      2
    );
    let g = groups.find((x) => x.group === def.group);
    if (!g) {
      g = { group: def.group, events: [] };
      groups.push(g);
    }
    g.events.push({ ...def, exampleBody });
  }
  return groups;
}

/** Outgoing HTTP headers documentation. */
export const WEBHOOK_HEADERS: { name: string; description: string }[] = [
  { name: "X-VaultysClaw-Event", description: "The event type, e.g. workspace.created." },
  { name: "X-VaultysClaw-Delivery", description: "Unique UUID for this delivery attempt." },
  {
    name: "X-VaultysClaw-Timestamp",
    description: "Milliseconds-epoch timestamp used in the signature.",
  },
  {
    name: "X-VaultysClaw-Signature",
    description: "sha256=<hex HMAC-SHA256 of `${timestamp}.${rawBody}` with your signing secret>.",
  },
];

/** Node.js verification snippet shown in the docs. */
export const VERIFY_SNIPPET_NODE = `import crypto from "node:crypto";

// In your webhook handler — verify BEFORE parsing/trusting the body.
function verify(rawBody, headers, secret) {
  const ts = headers["x-vaultysclaw-timestamp"];
  const signature = headers["x-vaultysclaw-signature"];
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(\`\${ts}.\${rawBody}\`).digest("hex");
  // constant-time compare
  return (
    signature &&
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}`;
