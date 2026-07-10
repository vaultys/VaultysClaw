/**
 * Notification event catalog — the single source of truth shared by the control
 * plane (event enqueueing + settings UI) and the notifier service (event
 * processing). Contains only types and constants; no Prisma / runtime deps so it
 * can be imported anywhere.
 */

/** Audience level of an event. Controls both recipient resolution and which
 * events a user is allowed to configure in the settings UI. */
export type NotificationLevel = "user" | "admin" | "owner";

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
  level: NotificationLevel;
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
  {
    type: "workspace.member_added",
    level: "user",
    label: "Added to a workspace",
    description: "Someone added you to a workspace.",
    defaultChannels: ["inApp"],
  },
  {
    type: "workspace.member_removed",
    level: "user",
    label: "Removed from a workspace",
    description: "Someone removed you from a workspace.",
    defaultChannels: ["inApp"],
  },
  {
    type: "user.joined",
    level: "admin",
    label: "New user joined",
    description: "A user completed onboarding and joined VaultysClaw.",
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
 * recipients from the event's level plus the fields in `data`.
 */
export interface NotificationJob {
  eventType: string;
  /** Free-form context, e.g. { workspaceId, workspaceName, targetUserId, actorName }. */
  data: Record<string, unknown>;
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
