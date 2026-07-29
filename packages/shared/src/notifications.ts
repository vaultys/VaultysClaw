/**
 * Notification event catalog — the single source of truth shared by the control
 * plane (event enqueueing + settings UI) and the notifier service (event
 * processing). Contains only types and constants; no Prisma / runtime deps so it
 * can be imported anywhere.
 */

/** Audience level of an event. Controls which events a user is allowed to
 * configure in the settings UI (a Member sees `user`, an Admin `user`+`admin`,
 * an Owner all). It does NOT by itself decide recipients — see {@link
 * NotificationAudience}. */
export type NotificationLevel = "user" | "admin" | "owner";

/** How recipients are resolved for an event (decoupled from `level`, which is
 * about who may *configure* it):
 *   - `target`           → the single user named in the payload (`targetUserId` ?? `userId`)
 *   - `workspaceMembers` → every member of `data.workspaceId`
 *   - `admins`           → every Admin/Owner
 *   - `owners`           → every Owner
 */
export type NotificationAudience =
  | "target"
  | "workspaceMembers"
  | "admins"
  | "owners";

/** Delivery channels a user can toggle per event. */
export type NotificationChannel = "inApp" | "email" | "push";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "inApp",
  "email",
  "push",
];

export interface NotificationEventDef {
  /** Stable catalog key, e.g. "workspace.member_added". */
  type: string;
  /** Who may configure this event in the settings UI. */
  level: NotificationLevel;
  /** How recipients are resolved when the event fires. */
  audience: NotificationAudience;
  /** Short UI label. */
  label: string;
  /** UI description. */
  description: string;
  /** Channels enabled by default when a user has no explicit preference. */
  defaultChannels: NotificationChannel[];
}

/**
 * The catalog. Extend this list to add new notification events — the settings
 * UI, preference storage and notifier all derive from it.
 */
export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  // ── User-level ──────────────────────────────────────────────────────────────
  {
    type: "workspace.member_added",
    level: "user",
    audience: "target",
    label: "Added to a workspace",
    description: "Someone added you to a workspace.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.member_removed",
    level: "user",
    audience: "target",
    label: "Removed from a workspace",
    description: "Someone removed you from a workspace.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.agent_added",
    level: "user",
    audience: "workspaceMembers",
    label: "Agent added to a workspace",
    description: "A new agent was added to a workspace you belong to.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.agent_removed",
    level: "user",
    audience: "workspaceMembers",
    label: "Agent removed from a workspace",
    description: "An agent was removed from a workspace you belong to.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.workflow_added",
    level: "user",
    audience: "workspaceMembers",
    label: "Workflow added to a workspace",
    description: "A new workflow was added to a workspace you belong to.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.workflow_removed",
    level: "user",
    audience: "workspaceMembers",
    label: "Workflow removed from a workspace",
    description: "A workflow was removed from a workspace you belong to.",
    defaultChannels: ["inApp"],
  },
  {
    type: "inbox.message",
    level: "user",
    audience: "target",
    label: "New inbox item",
    description: "You have a new item in your inbox.",
    defaultChannels: ["inApp"],
  },
  {
    type: "profile.updated",
    level: "user",
    audience: "target",
    label: "Profile updated",
    description: "Your profile (name, email, …) was updated.",
    defaultChannels: ["inApp"],
  },
  {
    type: "grant.received",
    level: "user",
    audience: "target",
    label: "Access granted",
    description: "You were granted a capability delegation.",
    defaultChannels: ["inApp"],
  },
  {
    type: "grant.revoked",
    level: "user",
    audience: "target",
    label: "Access revoked",
    description: "A capability delegation of yours was revoked.",
    defaultChannels: ["inApp"],
  },
  {
    type: "tool.approval_required",
    level: "user",
    audience: "workspaceMembers",
    label: "Tool approval required",
    description: "An agent is waiting for approval to run a tool.",
    defaultChannels: ["inApp"],
  },

  // ── Admin-level ─────────────────────────────────────────────────────────────
  {
    type: "user.joined",
    level: "admin",
    audience: "admins",
    label: "New user joined",
    description: "A user completed onboarding and joined VaultysClaw.",
    defaultChannels: ["inApp"],
  },
  {
    type: "agent.pending",
    level: "admin",
    audience: "admins",
    label: "Agent awaiting approval",
    description: "A new agent requested registration and needs approval.",
    defaultChannels: ["inApp"],
  },
  {
    type: "proxy.pending",
    level: "admin",
    audience: "admins",
    label: "Proxy awaiting approval",
    description: "A new proxy requested registration and needs approval.",
    defaultChannels: ["inApp"],
  },
  {
    type: "proxy.created",
    level: "admin",
    audience: "admins",
    label: "Proxy created",
    description: "A new proxy was approved and connected.",
    defaultChannels: ["inApp"],
  },
  {
    type: "proxy.unknown_principal",
    level: "admin",
    audience: "admins",
    label: "Unknown proxy principal detected",
    description: "A proxy saw a caller/agent identity it doesn't recognize and needs governance rules assigned.",
    defaultChannels: ["inApp"],
  },
  {
    type: "policy.updated",
    level: "admin",
    audience: "admins",
    label: "Policy changed",
    description: "A governance policy was created or updated.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.created",
    level: "admin",
    audience: "admins",
    label: "Workspace created",
    description: "A new workspace was created.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.deleted",
    level: "admin",
    audience: "admins",
    label: "Workspace deleted",
    description: "A workspace was deleted.",
    defaultChannels: ["inApp"],
  },
  {
    type: "agent.created",
    level: "admin",
    audience: "admins",
    label: "Agent created",
    description: "A new agent was created.",
    defaultChannels: ["inApp"],
  },
  {
    type: "agent.deleted",
    level: "admin",
    audience: "admins",
    label: "Agent deleted",
    description: "An agent was deleted.",
    defaultChannels: ["inApp"],
  },
  {
    type: "model.added",
    level: "admin",
    audience: "admins",
    label: "Model added",
    description: "A new model was added to the registry.",
    defaultChannels: ["inApp"],
  },
  {
    type: "model.removed",
    level: "admin",
    audience: "admins",
    label: "Model removed",
    description: "A model was removed from the registry.",
    defaultChannels: ["inApp"],
  },
  {
    type: "knowledge.added",
    level: "admin",
    audience: "admins",
    label: "Knowledge source added",
    description: "A new knowledge source was added.",
    defaultChannels: ["inApp"],
  },
  {
    type: "knowledge.removed",
    level: "admin",
    audience: "admins",
    label: "Knowledge source removed",
    description: "A knowledge source was removed.",
    defaultChannels: ["inApp"],
  },
  {
    type: "skill.added",
    level: "admin",
    audience: "admins",
    label: "Skill added",
    description: "A new skill was added.",
    defaultChannels: ["inApp"],
  },
  {
    type: "skill.removed",
    level: "admin",
    audience: "admins",
    label: "Skill removed",
    description: "A skill was removed.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workflow.failed",
    level: "admin",
    audience: "admins",
    label: "Workflow run failed",
    description: "A workflow run failed.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workflow.succeeded",
    level: "admin",
    audience: "admins",
    label: "Workflow run succeeded",
    description: "A workflow run completed successfully.",
    defaultChannels: ["inApp"],
  },
];

/** Which audience levels a given global role is allowed to see/configure. */
export const LEVELS_FOR_ROLE: Record<string, NotificationLevel[]> = {
  Member: ["user"],
  Admin: ["user", "admin"],
  Owner: ["user", "admin", "owner"],
};

/** Look up an event definition by its type key. */
export function getNotificationEvent(
  type: string
): NotificationEventDef | undefined {
  return NOTIFICATION_EVENTS.find((e) => e.type === type);
}

/** Events a role may configure, in catalog order. */
export function eventsForRole(
  role: string | null | undefined
): NotificationEventDef[] {
  const levels = LEVELS_FOR_ROLE[role ?? "Member"] ?? LEVELS_FOR_ROLE.Member;
  return NOTIFICATION_EVENTS.filter((e) => levels.includes(e.level));
}

/**
 * Payload placed on the BullMQ "notifications" queue. The notifier resolves the
 * recipients from the event's audience plus the fields in `data`.
 */
export interface NotificationJob {
  eventType: string;
  /** Free-form context, e.g. { workspaceId, workspaceName, targetUserId, actorName }. */
  data: Record<string, unknown>;
}

/**
 * Where a notification should take the user when clicked. `path` is an app-relative
 * route (used directly by the in-app bell / push click, and prefixed with the base
 * URL for email buttons). Returns null for events with no meaningful destination
 * (e.g. deletions). Single source of truth for both the client and the notifier.
 */
export interface NotificationAction {
  label: string;
  path: string;
}

export function notificationAction(
  eventType: string,
  data: Record<string, unknown> = {}
): NotificationAction | null {
  const s = (k: string) => (data[k] == null ? "" : String(data[k]));
  const enc = (k: string) => encodeURIComponent(s(k));

  switch (eventType) {
    case "workspace.member_added":
    case "workspace.agent_added":
    case "workspace.agent_removed":
    case "workspace.workflow_added":
    case "workspace.workflow_removed":
    case "workspace.created":
      return s("workspaceId")
        ? { label: "View workspace", path: `/workspaces/${enc("workspaceId")}` }
        : null;
    case "inbox.message":
      return { label: "Open inbox", path: "/app/inbox" };
    case "tool.approval_required":
      return { label: "Review approval", path: "/app/inbox" };
    case "profile.updated":
      return { label: "Review security", path: "/app/settings/security" };
    case "grant.received":
    case "grant.revoked":
      return { label: "Your access", path: "/app/settings/security" };
    case "user.joined":
      return { label: "View users", path: "/admin/users" };
    case "agent.pending":
    case "proxy.pending":
      return { label: "Review registration", path: "/admin/registrations" };
    case "proxy.created":
      return s("proxyDid")
        ? { label: "View proxy", path: `/admin/proxies/${enc("proxyDid")}` }
        : null;
    case "proxy.unknown_principal":
      return s("proxyDid")
        ? { label: "Review principal", path: `/admin/proxies/${enc("proxyDid")}` }
        : null;
    case "policy.updated":
      return { label: "View governance", path: "/admin/governance" };
    case "agent.created":
      return s("agentDid")
        ? { label: "View agent", path: `/admin/agents/${enc("agentDid")}` }
        : null;
    case "model.added":
    case "model.removed":
      return { label: "View models", path: "/admin/models" };
    case "knowledge.added":
    case "knowledge.removed":
      return { label: "View knowledge", path: "/admin/knowledge" };
    case "skill.added":
    case "skill.removed":
      return { label: "View skills", path: "/admin/skills" };
    case "workflow.failed":
    case "workflow.succeeded":
      return s("runId")
        ? { label: "View run", path: `/admin/workflows/runs/${enc("runId")}` }
        : null;
    // No destination: workspace.member_removed, workspace.deleted, agent.deleted
    default:
      return null;
  }
}

/** Name of the BullMQ queue used for notification jobs. */
export const NOTIFICATION_QUEUE_NAME = "notifications";

/** Redis pub/sub channel a user's live SSE stream subscribes to. */
export function userNotificationChannel(userId: string): string {
  return `notif:user:${userId}`;
}

/** Shape published on the Redis pub/sub channel and forwarded over SSE. */
export interface NotificationStreamMessage {
  id?: string;
  eventType: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
  /** When true, the client should also raise a system Notification. */
  push?: boolean;
}
