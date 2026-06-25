import type { RealmDetail } from "@/lib/contracts";

/* ─── Member / workflow shapes derived from the RealmDetail payload ─── */

export type RealmAgentMember = RealmDetail["agentRealms"][number];
export type RealmUserMember = RealmDetail["userRealms"][number];
export type RealmWorkflow = RealmDetail["workflows"][number];
export type RealmTokenUsage = RealmDetail["tokenUsage"];

/** A single model row in the realm Models tab (subset of the registry model). */
export interface RealmModelRow {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  litellmModelName: string | null;
  status: string;
}

export type RealmTab =
  | "agents"
  | "users"
  | "workflows"
  | "skills"
  | "models"
  | "channels"
  | "org-chart"
  | "map"
  | "config";

export const REALM_TABS: RealmTab[] = [
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

/** Capabilities selectable as realm defaults in the Config tab. */
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
