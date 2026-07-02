import type { Node } from "reactflow";

/** A workflow graph edge (subset of the React Flow edge we rely on). */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

/** Workspace user as returned by `GET /api/users/search`. */
export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

/**
 * Union of all data fields a workflow node can carry across the node types
 * configured in the properties panel. All optional — each node type uses a
 * subset.
 */
export interface WorkflowNodeData {
  label?: string;
  // agent / skill
  agentId?: string;
  agentName?: string;
  params?: Record<string, unknown>;
  skillName?: string;
  toolName?: string;
  // condition
  expression?: string;
  // delay
  duration?: number;
  // parallel
  agents?: string[];
  // label
  text?: string;
  color?: string;
  // user
  mode?: "approval" | "notification";
  message?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  timeout?: number;
}

export type FlowNode = Node<WorkflowNodeData>;

/** Patch one field on the currently selected node. */
export type UpdateNodeData = (
  key: keyof WorkflowNodeData,
  value: unknown
) => void;

/** Patch several fields on the currently selected node at once. */
export type UpdateNodeFields = (patch: Partial<WorkflowNodeData>) => void;

// ---------------------------------------------------------------------------
// Static skill catalog — matches packages/agent-controller/skills/*
// ---------------------------------------------------------------------------
export const SKILL_CATALOG: Record<
  string,
  {
    label: string;
    tools: { name: string; label: string; approvalRequired?: boolean }[];
  }
> = {
  "social-media": {
    label: "Social Media",
    tools: [
      { name: "setup_x_session", label: "Setup X session" },
      { name: "post_to_x", label: "Post to X", approvalRequired: true },
      { name: "check_x_session", label: "Check X session" },
      { name: "clear_x_session", label: "Clear X session" },
    ],
  },
  "web-scraper": {
    label: "Web Scraper",
    tools: [{ name: "scrape_page", label: "Scrape page" }],
  },
  "json-api": {
    label: "JSON API",
    tools: [{ name: "api_call_json", label: "API call (JSON)" }],
  },
  calculator: {
    label: "Calculator",
    tools: [{ name: "calculate", label: "Calculate" }],
  },
};

export const CRON_PRESETS = [
  { label: "Every day at 9 AM", value: "0 9 * * *" },
  { label: "Every day at noon", value: "0 12 * * *" },
  { label: "Weekdays at 9 AM", value: "0 9 * * 1-5" },
  { label: "Every Monday at 8 AM", value: "0 8 * * 1" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Custom…", value: "" },
] as const;

/** Label-node color swatches → background class. */
export const LABEL_COLORS: Record<string, string> = {
  yellow: "bg-warning-300",
  pink: "bg-danger-300",
  blue: "bg-primary-300",
  green: "bg-success-300",
  purple: "bg-secondary-300",
  red: "bg-danger-300",
  amber: "bg-warning-300",
  cyan: "bg-primary-300",
};
