/**
 * Webhook event catalog — the single source of truth shared by the control
 * plane (event enqueueing + settings UI) and the webhook-dispatcher service
 * (event delivery). Contains only types and constants; no Prisma / runtime deps
 * so it can be imported anywhere.
 *
 * Unlike notifications, webhooks have no per-user level/audience/channel: a
 * webhook subscription is org-global and simply lists the event types it wants.
 * Each event carries an explicitly-built, sanitized payload (never any secret,
 * password or key material) constructed at the domain emission site.
 */

/** Name of the BullMQ queue used for webhook jobs. */
export const WEBHOOK_QUEUE_NAME = "webhooks";

export interface WebhookEventDef {
  /** Stable catalog key, e.g. "workspace.created". */
  type: string;
  /** Short UI label. */
  label: string;
  /** UI description shown when configuring a webhook. */
  description: string;
  /** UI grouping, e.g. "Workspaces", "Agents". */
  group: string;
}

/**
 * Payload placed on the BullMQ "webhooks" queue. `payload` is already sanitized
 * (built explicitly at the emission site — no sensitive fields). The dispatcher
 * fans it out to every active subscription whose `events` include `eventType`.
 */
export interface WebhookJob {
  eventType: string;
  /** Sanitized, event-specific data (the workspace, the agent, …). */
  payload: Record<string, unknown>;
  /** ISO 8601 timestamp of when the domain event occurred. */
  occurredAt: string;
}

/**
 * The catalog. Extend this list to add new webhook events — the settings UI and
 * the dispatcher both derive from it.
 *
 * ⚠️ When you add/remove/change an event here you MUST also update its example
 * in `control-plane/lib/webhook-docs.ts` (`EXAMPLE_PAYLOADS`) so the
 * `/admin/webhooks/docs` reference stays correct — a missing entry documents an
 * empty `{}` payload. Full checklist: root CLAUDE.md → Webhooks.
 */
export const WEBHOOK_EVENTS: WebhookEventDef[] = [
  // ── Authentication ────────────────────────────────────────────────────────
  {
    type: "user.login",
    label: "User signed in",
    description: "A user successfully signed in.",
    group: "Authentication",
  },
  {
    type: "user.logout",
    label: "User signed out",
    description: "A user signed out.",
    group: "Authentication",
  },
  // ── Users ─────────────────────────────────────────────────────────────────
  {
    type: "user.created",
    label: "User created",
    description: "A new user account was created.",
    group: "Users",
  },
  {
    type: "user.updated",
    label: "User updated",
    description: "A user account was modified.",
    group: "Users",
  },
  {
    type: "user.deleted",
    label: "User deleted",
    description: "A user account was deleted.",
    group: "Users",
  },
  {
    type: "user.joined",
    label: "User joined",
    description: "A user completed onboarding and joined the organization.",
    group: "Users",
  },
  // ── Agents ────────────────────────────────────────────────────────────────
  {
    type: "agent.approval_requested",
    label: "Agent approval requested",
    description: "An agent registered and is awaiting admin approval.",
    group: "Agents",
  },
  {
    type: "agent.created",
    label: "Agent created",
    description: "An agent was approved and created.",
    group: "Agents",
  },
  {
    type: "agent.updated",
    label: "Agent updated",
    description: "An agent's configuration was modified.",
    group: "Agents",
  },
  {
    type: "agent.deleted",
    label: "Agent deleted",
    description: "An agent was deleted.",
    group: "Agents",
  },
  // ── Workspaces ────────────────────────────────────────────────────────────
  {
    type: "workspace.created",
    label: "Workspace created",
    description: "A workspace was created.",
    group: "Workspaces",
  },
  {
    type: "workspace.updated",
    label: "Workspace updated",
    description: "A workspace was modified.",
    group: "Workspaces",
  },
  {
    type: "workspace.deleted",
    label: "Workspace deleted",
    description: "A workspace was deleted.",
    group: "Workspaces",
  },
  // ── Models ────────────────────────────────────────────────────────────────
  {
    type: "model.created",
    label: "Model created",
    description: "A model was added to the registry.",
    group: "Models",
  },
  {
    type: "model.updated",
    label: "Model updated",
    description: "A model in the registry was modified.",
    group: "Models",
  },
  {
    type: "model.deleted",
    label: "Model deleted",
    description: "A model was removed from the registry.",
    group: "Models",
  },
  // ── Knowledge ─────────────────────────────────────────────────────────────
  {
    type: "knowledge.created",
    label: "Knowledge created",
    description: "A knowledge source was added.",
    group: "Knowledge",
  },
  {
    type: "knowledge.deleted",
    label: "Knowledge deleted",
    description: "A knowledge source was removed.",
    group: "Knowledge",
  },
  // ── Skills ────────────────────────────────────────────────────────────────
  {
    type: "skill.created",
    label: "Skill created",
    description: "A skill was added to the org library.",
    group: "Skills",
  },
  {
    type: "skill.updated",
    label: "Skill updated",
    description: "A skill in the org library was modified.",
    group: "Skills",
  },
  {
    type: "skill.deleted",
    label: "Skill deleted",
    description: "A skill was removed from the org library.",
    group: "Skills",
  },
  // ── Workflows ─────────────────────────────────────────────────────────────
  {
    type: "workflow.succeeded",
    label: "Workflow succeeded",
    description: "A workflow run completed successfully.",
    group: "Workflows",
  },
  {
    type: "workflow.failed",
    label: "Workflow failed",
    description: "A workflow run failed.",
    group: "Workflows",
  },
];

/** Look up an event definition by its type key. */
export function getWebhookEvent(type: string): WebhookEventDef | undefined {
  return WEBHOOK_EVENTS.find((e) => e.type === type);
}

/** All event type keys, in catalog order. */
export function webhookEventTypes(): string[] {
  return WEBHOOK_EVENTS.map((e) => e.type);
}
