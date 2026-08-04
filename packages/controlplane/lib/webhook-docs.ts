/**
 * Webhook documentation data — the single source of truth for the admin webhook docs page.
 * Example payloads are produced by feeding representative sample data through the very same
 * builders used at the emission sites (`lib/webhook-payloads.ts`), so the documented shapes never
 * drift from what is actually delivered.
 */
import type { WebhookEventDef } from "@vaultysclaw/shared";
import { CONTROLPLANE_WEBHOOK_EVENTS } from "./webhook-events";
import { actorPayload, certificatePayload, workspacePayload } from "./webhook-payloads";

// ── Representative sample domain objects ────────────────────────────────────

const sampleActor = {
  did: "did:vaultys:0027e83f5d035a5dc5651126a10606f2f4d9701e",
  name: "research-assistant",
  kind: "openclaw",
  workspaceId: "ws_9f3a2b",
  registeredAt: "2026-07-16T09:20:00.000Z",
  lastSeen: "2026-07-16T09:25:00.000Z",
};

const sampleCertificate = {
  id: "cert_7c8d9e",
  agentDid: sampleActor.did,
  workspaceId: sampleActor.workspaceId,
  capabilities: ["file_access", "internet_access"],
  certFormat: "challenger",
  status: "active",
  issuedBy: "did:vaultys:0071ec50c977d4e05682764806c7fc03556de6af",
  issuedAt: "2026-07-16T09:24:00.000Z",
  expiresAt: "2027-07-16T09:24:00.000Z",
  revokedAt: null,
  revokedBy: null,
  revokedReason: null,
};

const sampleWorkspace = {
  id: "ws_9f3a2b",
  name: "Acme Research",
  slug: "acme-research",
  description: "Workspace for the research team",
  color: "#6366f1",
  isDefault: false,
  createdAt: "2026-07-16T09:00:00.000Z",
};

// ── event type → example payload (mirrors the emission sites) ───────────────

const EXAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  "actor.registration_requested": {
    did: sampleActor.did,
    name: sampleActor.name,
    kind: sampleActor.kind,
    registrationId: "reg_3f4a5b",
  },
  "actor.approved": actorPayload(sampleActor),
  "actor.denied": { did: sampleActor.did, name: sampleActor.name, kind: sampleActor.kind },
  "actor.updated": actorPayload(sampleActor),

  "certificate.issued": certificatePayload(sampleCertificate),
  "certificate.revoked": certificatePayload({
    ...sampleCertificate,
    status: "revoked",
    revokedAt: "2026-07-17T10:00:00.000Z",
    revokedBy: "did:vaultys:0071ec50c977d4e05682764806c7fc03556de6af",
    revokedReason: "No longer needed",
  }),

  "workspace.created": workspacePayload(sampleWorkspace),
  "workspace.updated": workspacePayload(sampleWorkspace),
  // Not wired yet — this rebuild has no workspace-delete action (see CLAUDE.md); shape shown for
  // reference, matching the emission-site convention this event already uses elsewhere.
  "workspace.deleted": { id: sampleWorkspace.id, name: sampleWorkspace.name },
};

export interface WebhookEventDoc extends WebhookEventDef {
  /** Full example request body ({ event, occurredAt, data }). */
  exampleBody: string;
}

/** Build the documented events, grouped by catalog group, with example bodies — restricted to
 *  the groups this package's Actor/Certificate/Workspace domain actually covers
 *  (`CONTROLPLANE_WEBHOOK_EVENTS`). */
export function buildWebhookEventDocs(): { group: string; events: WebhookEventDoc[] }[] {
  const groups: { group: string; events: WebhookEventDoc[] }[] = [];
  for (const def of CONTROLPLANE_WEBHOOK_EVENTS) {
    const data = EXAMPLE_PAYLOADS[def.type] ?? {};
    const exampleBody = JSON.stringify(
      { event: def.type, occurredAt: "2026-07-16T09:24:00.000Z", data },
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
  { name: "X-VaultysClaw-Timestamp", description: "Milliseconds-epoch timestamp used in the signature." },
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
