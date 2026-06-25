import type {
  IntentRecord,
  WorkflowRunWithName,
  WorkflowRunStepDetail,
} from "@/lib/contracts";

/* ─── Domain types (re-exported from contracts for local convenience) ─── */

export type Intent = IntentRecord;
export type WorkflowRun = WorkflowRunWithName;
export type WorkflowStep = WorkflowRunStepDetail;

/* ─── Activity-feed UI types (no backing contract / Prisma model) ─── */

export type FeedEventType =
  | "agent_online"
  | "agent_offline"
  | "intent_success"
  | "intent_failed"
  | "intent_pending"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_running"
  | "registration"
  | "system";

export interface FeedEvent {
  id: string;
  type: FeedEventType;
  message: string;
  detail?: string;
  timestamp: Date;
  /** If set, clicking this event opens the detail popup for this entity. */
  entityId?: string;
  entityType?: "agent" | "workflow" | "intent";
}

export type DetailItem =
  | { type: "agent"; id: string }
  | { type: "workflow"; id: string }
  | { type: "intent"; id: string };

export const FEED_ICON: Record<FeedEventType, string> = {
  agent_online: "↑",
  agent_offline: "↓",
  intent_success: "✓",
  intent_failed: "✗",
  intent_pending: "⋯",
  workflow_completed: "⊛",
  workflow_failed: "⊘",
  workflow_running: "▷",
  registration: "⊕",
  system: "·",
};

/** Maps event type to design-system color class */
export const FEED_COLOR: Record<FeedEventType, string> = {
  agent_online: "text-success-600",
  agent_offline: "text-foreground-600",
  intent_success: "text-success-600",
  intent_failed: "text-danger-600",
  intent_pending: "text-warning-600",
  workflow_completed: "text-success-600",
  workflow_failed: "text-danger-600",
  workflow_running: "text-primary-600",
  registration: "text-warning-600",
  system: "text-foreground-600",
};

/** Maps a (string) status to its design-system text color, with a fallback. */
export const STATUS_COLOR: Record<string, string> = {
  running: "text-primary-600",
  completed: "text-success-600",
  success: "text-success-600",
  failed: "text-danger-600",
  pending: "text-warning-600",
};

/** Resolve an intent's status to one of the three feed event types. */
export function intentFeedType(status: string): FeedEventType {
  if (status === "success") return "intent_success";
  if (status === "failed") return "intent_failed";
  return "intent_pending";
}

/** Display name for an intent's agent, falling back to a short DID suffix. */
export function agentLabel(
  agentDid: string | null,
  lookup: (did: string) => string | undefined
): string {
  if (!agentDid) return "unknown";
  return lookup(agentDid) ?? `…${agentDid.slice(-6)}`;
}
