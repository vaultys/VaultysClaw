/**
 * Title/body/type templates for Notification Channels (docs/REBUILD_ARCHITECTURE.md §5) — the
 * human-facing half of the same event pipeline Webhooks use. Unlike a webhook (raw JSON, the
 * receiver interprets it), Apprise needs a rendered `{title, body, type}` to actually display.
 *
 * Covers packages/controlplane's event catalog (actor.*, certificate.*, workspace.*) — this
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

/**
 * Appended to every rendered body, uniformly, rather than repeated in each renderer above:
 * who did it (`performedBy: {did, name}`, attached at the emission site in
 * packages/controlplane — absent for events with no human origin, e.g. an agent's own
 * `actor.registration_requested`) and a deep link back into the admin console
 * (`adminUrl`, also attached at the emission site — `null`/absent when neither `APP_URL` nor
 * `NEXTAUTH_URL` is configured there, rather than a link that can't resolve to anything).
 */
function appendFooter(body: string, payload: Record<string, unknown>): string {
  const lines: string[] = [body];
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
