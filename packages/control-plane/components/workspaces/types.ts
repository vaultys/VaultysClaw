import type { WorkspaceDetail } from "@/lib/contracts";

/* ─── Member / workflow shapes derived from the WorkspaceDetail payload ─── */

export type WorkspaceAgentMember = WorkspaceDetail["agentWorkspaces"][number];
export type WorkspaceUserMember = WorkspaceDetail["userWorkspaces"][number];
export type WorkspaceWorkflow = WorkspaceDetail["workflows"][number];
export type WorkspaceTokenUsage = WorkspaceDetail["tokenUsage"];

/** A single model row in the workspace Models tab (subset of the registry model). */
export interface WorkspaceModelRow {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  litellmModelName: string | null;
  status: string;
}

export type WorkspaceTab =
  | "agents"
  | "users"
  | "workflows"
  | "skills"
  | "models"
  | "channels"
  | "org-chart"
  | "map"
  | "config";

export const WORKSPACE_TABS: WorkspaceTab[] = [
  "agents",
  "users",
  "workflows",
  "skills",
  "models",
  "channels",
  "org-chart",
  "map",
  "config",
];

export const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#06b6d4",
];

/** Capabilities selectable as workspace defaults in the Config tab. */
export const ALL_CAPS = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
  "llm_query",
];
