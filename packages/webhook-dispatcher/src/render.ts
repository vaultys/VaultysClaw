/**
 * Title/body/type templates for Notification Channels (docs/REBUILD_ARCHITECTURE.md §5) — the
 * human-facing half of the same event pipeline Webhooks use. Unlike a webhook (raw JSON, the
 * receiver interprets it), Apprise needs a rendered `{title, body, type}` to actually display.
 *
 * Covers packages/controlplane's event catalog (actor.*, human.*, certificate.*, workspace.*) — this
 * package's own domain (packages/control-plane's agent/model/etc. events) doesn't have
 * Notification Channels wired up yet; that would need its own template set here, keyed the same
 * way, whenever that migration (rebuild doc §8 step 4) actually happens.
 */
import type { WebhookJob } from "@vaultysclaw/shared";

/** Matches Apprise's own notification type vocabulary — affects icon/color for services that
 *  support it (e.g. ntfy, Discord embeds). */
export type NotificationType = "info" | "success" | "warning" | "failure";

export interface RenderedNotification {
  title: string;
  body: string;
  type: NotificationType;
}

type Renderer = (payload: Record<string, unknown>) => RenderedNotification;

function str(v: unknown, fallback = "unknown"): string {
  return typeof v === "string" && v ? v : fallback;
}

/** A count for a body line. 0 is a real value and must render as "0", not as a
 *  fallback — "0 rules" is precisely the state worth telling someone about. */
function num(v: unknown, fallback = "?"): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : fallback;
}

const RENDERERS: Record<string, Renderer> = {
  "actor.registration_requested": (p) => ({
    title: "New Actor registration pending",
    body: `${str(p.name)} (${str(p.kind)}) is awaiting admin approval.`,
    type: "info",
  }),
  "actor.approved": (p) => ({
    title: "Actor approved",
    body: `${str(p.name)} (${str(p.kind)}) was approved and is now active.`,
    type: "success",
  }),
  "actor.denied": (p) => ({
    title: "Actor registration denied",
    body: `${str(p.name)} (${str(p.kind)})'s registration was denied.`,
    type: "warning",
  }),
  "actor.updated": (p) => ({
    title: "Actor updated",
    body: `${str(p.name)}'s profile was modified.`,
    type: "info",
  }),
  // proxy.config_updated has been in the catalog and the docs since the proxy
  // kind shipped, but had no renderer — so it was subscribable, deliverable as a
  // webhook, and silently never reached a notification channel. Exactly the gap
  // the root CLAUDE.md checklist warns about; added here alongside its harness
  // twin rather than left for the next person to rediscover.
  "proxy.config_updated": (p) => ({
    title: "Proxy enforcement changed",
    body: `${str(p.name)}: mode ${str(p.mode)}, ${num(p.ruleCount)} rule(s).`,
    type: "warning",
  }),
  "harness.config_updated": (p) => ({
    title: "Harness supervision changed",
    body:
      `${str(p.name)}: mode ${str(p.mode)}, confinement ${str(p.sandbox)}, ` +
      `${num(p.resourceRuleCount)} resource rule(s).`,
    // Warning rather than info: this changes what a host refuses. A change that
    // turns enforcement off should not arrive looking like routine news.
    type: "warning",
  }),
  "actor.deleted": (p) => ({
    title: "Actor deleted",
    body: `${str(p.name)} (${str(p.kind)}) was removed; ${num(p.revokedCertificateCount)} certificate(s) revoked.`,
    // Warning, not info: this both removes an identity and ends every grant it
    // held. An estate shrinking unexpectedly is worth someone looking at.
    type: "warning",
  }),
  "human.invited": (p) => ({
    title: "Human invited",
    body: `${str(p.name)} was invited to onboard${p.email ? ` (${str(p.email)})` : ""}.`,
    type: "info",
  }),
  "human.invitation_redeemed": (p) => ({
    title: "Human onboarded via invite",
    body: `${str(p.name)} accepted their invite and is now active.`,
    type: "success",
  }),
  "certificate.issued": (p) => {
    const caps = Array.isArray(p.capabilities) ? (p.capabilities as string[]) : [];
    return {
      title: "Certificate issued",
      body: `A certificate for ${str(p.agentDid)} was issued${caps.length ? ` (${caps.join(", ")})` : ""}.`,
      type: "success",
    };
  },
  "certificate.revoked": (p) => ({
    title: "Certificate revoked",
    body: `A certificate for ${str(p.agentDid)} was revoked${p.revokedReason ? `: ${str(p.revokedReason)}` : "."}`,
    type: "warning",
  }),
  "workspace.created": (p) => ({
    title: "Workspace created",
    body: `Workspace "${str(p.name)}" was created.`,
    type: "success",
  }),
  "workspace.updated": (p) => ({
    title: "Workspace updated",
    body: `Workspace "${str(p.name)}" was modified.`,
    type: "info",
  }),
  "workspace.deleted": (p) => ({
    title: "Workspace deleted",
    body: `Workspace "${str(p.name)}" was deleted.`,
    type: "warning",
  }),
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(none)";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(none)";
  return String(v);
}

/**
 * What actually changed on an update (`changes: FieldChange[]`, attached at the emission site in
 * packages/controlplane — see `lib/webhook-payloads.ts`'s `diffFields`) — only present on
 * *.updated events, since *.created/*.approved have no "before" to diff against.
 */
function appendChanges(lines: string[], payload: Record<string, unknown>): void {
  const changes = payload.changes as { field: string; from: unknown; to: unknown }[] | undefined;
  if (!changes || changes.length === 0) return;
  lines.push("Changes:");
  for (const c of changes) {
    lines.push(`  ${c.field}: ${formatValue(c.from)} → ${formatValue(c.to)}`);
  }
}

/** What was actually granted on approval — not a diff (there's no prior Actor state to compare
 *  against), but still the change that matters for this event. */
function appendGrantedCapabilities(lines: string[], payload: Record<string, unknown>): void {
  const granted = payload.grantedCapabilities;
  if (!Array.isArray(granted)) return;
  lines.push(granted.length > 0 ? `Granted: ${granted.join(", ")}` : "Granted: (no capabilities)");
}

/**
 * Appended to every rendered body, uniformly, rather than repeated in each renderer above: what
 * changed (see appendChanges/appendGrantedCapabilities above), who did it (`performedBy:
 * {did, name}`, attached at the emission site in packages/controlplane — absent for events with
 * no human origin, e.g. an agent's own `actor.registration_requested`), and a deep link back into
 * the admin console (`adminUrl`, also attached at the emission site — `null`/absent when neither
 * `APP_URL` nor `NEXTAUTH_URL` is configured there, rather than a link that can't resolve to
 * anything).
 */
function appendFooter(body: string, payload: Record<string, unknown>): string {
  const lines: string[] = [body];
  appendChanges(lines, payload);
  appendGrantedCapabilities(lines, payload);
  const performedBy = payload.performedBy as { name?: string } | undefined;
  if (performedBy?.name) lines.push(`By: ${performedBy.name}`);
  if (typeof payload.adminUrl === "string" && payload.adminUrl) lines.push(`View: ${payload.adminUrl}`);
  return lines.join("\n");
}

/** Renders a job into a Notification Channel payload, or null for an event type with no template
 *  — the caller should skip Notification Channel delivery for that job, not send a blank alert. */
export function renderNotification(job: WebhookJob): RenderedNotification | null {
  const renderer = RENDERERS[job.eventType];
  if (!renderer) return null;
  const rendered = renderer(job.payload);
  return { ...rendered, body: appendFooter(rendered.body, job.payload) };
}
