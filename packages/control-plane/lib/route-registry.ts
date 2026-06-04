/**
 * Canonical registry of all API routes exposed by the control plane.
 *
 * This file is the single source of truth for:
 *   - The route permission selector UI (API key creation modal)
 *   - The Swagger coverage check script (scripts/check-api-coverage.ts)
 *
 * When you add a new route, also add an entry here.
 * Run `pnpm tsx scripts/check-api-coverage.ts` to detect discrepancies.
 */

export interface RouteEntry {
  /** Next.js-style path, e.g. "/api/agents/[did]" */
  path: string;
  /** Supported HTTP methods */
  methods: string[];
  /** Top-level group shown in the permission tree */
  group: string;
  /** Optional sub-group for nested display */
  subgroup?: string;
  /** Short description displayed in the UI and Swagger */
  description: string;
  /** If true, the route is accessible without any authentication */
  isPublic?: boolean;
}

export const ROUTE_REGISTRY: RouteEntry[] = [
  // ── Public / system ──────────────────────────────────────────────────────
  {
    path: "/api/health",
    methods: ["GET"],
    group: "System",
    description: "Health check",
    isPublic: true,
  },
  {
    path: "/api/setup/status",
    methods: ["GET"],
    group: "System",
    description: "First-run setup status",
    isPublic: true,
  },
  {
    path: "/api/about",
    methods: ["GET"],
    group: "System",
    description: "Server version and build info",
    isPublic: true,
  },

  // ── Agents ───────────────────────────────────────────────────────────────
  {
    path: "/api/agents",
    methods: ["GET"],
    group: "Agents",
    description: "List all agents",
  },
  {
    path: "/api/agents/search",
    methods: ["GET"],
    group: "Agents",
    description: "Search agents",
  },
  {
    path: "/api/agents/[did]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Get, update or delete an agent",
  },
  {
    path: "/api/agents/[did]/llm-config",
    methods: ["GET", "PUT", "DELETE"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Agent LLM configuration",
  },
  {
    path: "/api/agents/[did]/realm-llm",
    methods: ["GET"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Agent realm LLM config",
  },
  {
    path: "/api/agents/[did]/chat-sessions",
    methods: ["GET"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Agent chat sessions",
  },
  {
    path: "/api/agents/[did]/skills",
    methods: ["GET", "PATCH"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Agent skill overrides",
  },
  {
    path: "/api/agents/[did]/token-usage",
    methods: ["GET"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Agent token usage statistics",
  },
  {
    path: "/api/agents/[did]/peers",
    methods: ["GET", "POST"],
    group: "Agents",
    subgroup: "Agent peers",
    description: "Agent peer grants",
  },
  {
    path: "/api/agents/[did]/peers/[grantId]",
    methods: ["GET", "DELETE"],
    group: "Agents",
    subgroup: "Agent peers",
    description: "Get or revoke a peer grant",
  },
  {
    path: "/api/agents/[did]/schedules",
    methods: ["POST", "DELETE"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Agent scheduled tasks",
  },
  {
    path: "/api/agents/[did]/tasks",
    methods: ["POST"],
    group: "Agents",
    subgroup: "Agent details",
    description: "Send a task to an agent",
  },

  // ── Registrations ────────────────────────────────────────────────────────
  {
    path: "/api/registrations",
    methods: ["GET"],
    group: "Registrations",
    description: "List pending agent registrations",
  },
  {
    path: "/api/registrations/[id]/approve",
    methods: ["POST"],
    group: "Registrations",
    description: "Approve an agent registration",
  },
  {
    path: "/api/registrations/[id]/reject",
    methods: ["POST"],
    group: "Registrations",
    description: "Reject an agent registration",
  },

  // ── Intents ───────────────────────────────────────────────────────────────
  {
    path: "/api/intents",
    methods: ["GET", "POST"],
    group: "Intents",
    description: "List or create intents",
  },

  // ── Workflows ─────────────────────────────────────────────────────────────
  {
    path: "/api/workflows",
    methods: ["GET", "POST"],
    group: "Workflows",
    description: "List or create workflows",
  },
  {
    path: "/api/workflows/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Workflows",
    subgroup: "Workflow details",
    description: "Get, update or delete a workflow",
  },
  {
    path: "/api/workflows/[id]/execute",
    methods: ["POST"],
    group: "Workflows",
    subgroup: "Workflow details",
    description: "Trigger a workflow run",
  },
  {
    path: "/api/workflows/[id]/export",
    methods: ["GET"],
    group: "Workflows",
    subgroup: "Workflow details",
    description: "Export a workflow as JSON",
  },
  {
    path: "/api/workflows/[id]/schedule",
    methods: ["GET", "POST", "DELETE"],
    group: "Workflows",
    subgroup: "Workflow details",
    description: "Workflow schedule",
  },
  {
    path: "/api/workflows/import",
    methods: ["POST"],
    group: "Workflows",
    description: "Import a workflow from JSON",
  },
  {
    path: "/api/workflows/templates",
    methods: ["GET"],
    group: "Workflows",
    subgroup: "Templates",
    description: "List workflow templates",
  },
  {
    path: "/api/workflows/templates/[templateId]",
    methods: ["GET"],
    group: "Workflows",
    subgroup: "Templates",
    description: "Get a workflow template",
  },
  {
    path: "/api/workflows/test-seed",
    methods: ["POST"],
    group: "Workflows",
    description: "Seed test workflows (dev only)",
  },

  // ── Workflow runs ─────────────────────────────────────────────────────────
  {
    path: "/api/workflow-runs",
    methods: ["GET"],
    group: "Workflow Runs",
    description: "List workflow runs",
  },
  {
    path: "/api/workflow-runs/[id]",
    methods: ["GET"],
    group: "Workflow Runs",
    description: "Get a workflow run",
  },
  {
    path: "/api/workflows/runs/[runId]/status",
    methods: ["GET"],
    group: "Workflow Runs",
    description: "Get run status",
  },
  {
    path: "/api/workflows/runs/[runId]/history",
    methods: ["GET"],
    group: "Workflow Runs",
    description: "Get run step history",
  },

  // ── Workflow approvals ────────────────────────────────────────────────────
  {
    path: "/api/workflow-approvals",
    methods: ["GET"],
    group: "Workflow Approvals",
    description: "List pending approvals",
  },
  {
    path: "/api/workflow-approvals/[id]/approve",
    methods: ["POST"],
    group: "Workflow Approvals",
    description: "Approve a workflow step",
  },
  {
    path: "/api/workflow-approvals/[id]/reject",
    methods: ["POST"],
    group: "Workflow Approvals",
    description: "Reject a workflow step",
  },
  {
    path: "/api/workflow-approvals/[id]/dismiss",
    methods: ["POST"],
    group: "Workflow Approvals",
    description: "Dismiss a workflow approval",
  },

  // ── Channels ──────────────────────────────────────────────────────────────
  {
    path: "/api/channels",
    methods: ["GET", "POST"],
    group: "Channels",
    description: "List or create channels",
  },
  {
    path: "/api/channels/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Channels",
    subgroup: "Channel details",
    description: "Get, update or delete a channel",
  },
  {
    path: "/api/channels/[id]/members",
    methods: ["POST", "DELETE"],
    group: "Channels",
    subgroup: "Channel details",
    description: "Add or remove channel members",
  },
  {
    path: "/api/channels/[id]/messages",
    methods: ["GET", "POST"],
    group: "Channels",
    subgroup: "Messages",
    description: "List or post channel messages",
  },
  {
    path: "/api/channels/[id]/messages/[msgId]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Channels",
    subgroup: "Messages",
    description: "Get, edit or delete a message",
  },
  {
    path: "/api/channels/[id]/messages/[msgId]/reactions",
    methods: ["POST"],
    group: "Channels",
    subgroup: "Messages",
    description: "Add a reaction to a message",
  },
  {
    path: "/api/channels/[id]/messages/agent-response",
    methods: ["POST"],
    group: "Channels",
    subgroup: "Messages",
    description: "Post an agent response",
  },
  {
    path: "/api/channels/[id]/threads",
    methods: ["GET", "POST"],
    group: "Channels",
    subgroup: "Threads",
    description: "List or create threads",
  },
  {
    path: "/api/channels/[id]/bridges",
    methods: ["GET", "POST"],
    group: "Channels",
    subgroup: "Bridges",
    description: "List or create channel bridges",
  },
  {
    path: "/api/channels/[id]/bridges/[bridgeId]",
    methods: ["PATCH", "DELETE"],
    group: "Channels",
    subgroup: "Bridges",
    description: "Update or delete a channel bridge",
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  {
    path: "/api/users",
    methods: ["GET"],
    group: "Users",
    description: "List all users",
  },
  {
    path: "/api/users/me",
    methods: ["GET", "PATCH"],
    group: "Users",
    description: "Current user profile",
  },
  {
    path: "/api/users/search",
    methods: ["GET"],
    group: "Users",
    description: "Search users",
  },
  {
    path: "/api/users/invite",
    methods: ["GET"],
    group: "Users",
    subgroup: "Invitations",
    description: "List user invitations",
  },
  {
    path: "/api/users/invite/email",
    methods: ["POST"],
    group: "Users",
    subgroup: "Invitations",
    description: "Invite a user by email",
  },
  {
    path: "/api/users/invite/from-email",
    methods: ["POST"],
    group: "Users",
    subgroup: "Invitations",
    description: "Register from email invitation",
  },
  {
    path: "/api/users/[did]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Users",
    subgroup: "User details",
    description: "Get, update or delete a user",
  },
  {
    path: "/api/users/[did]/admin",
    methods: ["PATCH"],
    group: "Users",
    subgroup: "User details",
    description: "Toggle admin flag",
  },
  {
    path: "/api/users/[did]/grants",
    methods: ["GET", "POST"],
    group: "Users",
    subgroup: "User grants",
    description: "List or create user capability grants",
  },
  {
    path: "/api/users/[did]/grants/[id]",
    methods: ["DELETE"],
    group: "Users",
    subgroup: "User grants",
    description: "Revoke a user grant",
  },
  {
    path: "/api/users/unclaimed/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Users",
    subgroup: "Unclaimed users",
    description: "Manage unclaimed user slots",
  },
  {
    path: "/api/users/unclaimed/[id]/send-qr",
    methods: ["POST"],
    group: "Users",
    subgroup: "Unclaimed users",
    description: "Send QR code to unclaimed user",
  },

  // ── Realms ────────────────────────────────────────────────────────────────
  {
    path: "/api/realms",
    methods: ["GET", "POST"],
    group: "Realms",
    description: "List or create realms",
  },
  {
    path: "/api/realms/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Realms",
    subgroup: "Realm details",
    description: "Get, update or delete a realm",
  },
  {
    path: "/api/realms/[id]/default",
    methods: ["POST"],
    group: "Realms",
    subgroup: "Realm details",
    description: "Set realm as default",
  },
  {
    path: "/api/realms/[id]/agents",
    methods: ["POST", "DELETE"],
    group: "Realms",
    subgroup: "Realm members",
    description: "Add or remove agents from realm",
  },
  {
    path: "/api/realms/[id]/users",
    methods: ["POST", "PATCH", "DELETE"],
    group: "Realms",
    subgroup: "Realm members",
    description: "Manage realm users",
  },
  {
    path: "/api/realms/[id]/skills",
    methods: ["GET", "POST"],
    group: "Realms",
    subgroup: "Realm skills",
    description: "List or add realm skills",
  },
  {
    path: "/api/realms/[id]/skills/[skillId]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Realms",
    subgroup: "Realm skills",
    description: "Get, update or remove a realm skill",
  },
  {
    path: "/api/realms/[id]/models",
    methods: ["GET"],
    group: "Realms",
    subgroup: "Realm details",
    description: "List models available in realm",
  },
  {
    path: "/api/realms/[id]/credentials",
    methods: ["GET", "POST", "DELETE"],
    group: "Realms",
    subgroup: "Credentials",
    description: "Realm credentials management",
  },
  {
    path: "/api/realms/[id]/credentials/[credId]",
    methods: ["GET"],
    group: "Realms",
    subgroup: "Credentials",
    description: "Get a realm credential",
  },
  {
    path: "/api/realms/[id]/social-media",
    methods: ["POST"],
    group: "Realms",
    subgroup: "Realm details",
    description: "Realm social media config",
  },
  {
    path: "/api/me/realms",
    methods: ["GET"],
    group: "Realms",
    description: "List realms accessible to current user",
  },

  // ── Models ────────────────────────────────────────────────────────────────
  {
    path: "/api/models",
    methods: ["GET", "POST"],
    group: "Models",
    description: "List or register models",
  },
  {
    path: "/api/models/test",
    methods: ["POST"],
    group: "Models",
    description: "Test a model connection",
  },
  {
    path: "/api/models/[id]",
    methods: ["GET", "PUT", "DELETE"],
    group: "Models",
    subgroup: "Model details",
    description: "Get, update or delete a model",
  },
  {
    path: "/api/models/[id]/validate",
    methods: ["POST"],
    group: "Models",
    subgroup: "Model details",
    description: "Validate model configuration",
  },
  {
    path: "/api/models/[id]/realms",
    methods: ["GET", "POST", "DELETE"],
    group: "Models",
    subgroup: "Model details",
    description: "Model realm access grants",
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    path: "/api/skills",
    methods: ["GET", "POST"],
    group: "Skills",
    description: "List or create skills",
  },
  {
    path: "/api/skills/library",
    methods: ["GET"],
    group: "Skills",
    subgroup: "Library",
    description: "Browse skill library",
  },
  {
    path: "/api/skills/library/content",
    methods: ["GET"],
    group: "Skills",
    subgroup: "Library",
    description: "Get skill library entry content",
  },
  {
    path: "/api/org/skills",
    methods: ["GET", "POST"],
    group: "Skills",
    subgroup: "Org skills",
    description: "List or create org-level skills",
  },
  {
    path: "/api/org/skills/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    group: "Skills",
    subgroup: "Org skills",
    description: "Get, update or delete an org skill",
  },

  // ── Governance ────────────────────────────────────────────────────────────
  {
    path: "/api/policies",
    methods: ["GET", "POST"],
    group: "Governance",
    description: "List or create policies",
  },
  {
    path: "/api/policies/[id]",
    methods: ["GET", "DELETE"],
    group: "Governance",
    description: "Get or delete a policy",
  },
  {
    path: "/api/governance/audit",
    methods: ["GET"],
    group: "Governance",
    subgroup: "Audit log",
    description: "List governance audit events",
  },
  {
    path: "/api/governance/audit/[id]",
    methods: ["GET"],
    group: "Governance",
    subgroup: "Audit log",
    description: "Get an audit event",
  },
  {
    path: "/api/governance/summary",
    methods: ["GET"],
    group: "Governance",
    description: "Governance summary dashboard data",
  },
  {
    path: "/api/tool-approvals",
    methods: ["GET", "POST"],
    group: "Governance",
    description: "Pending tool approvals",
  },

  // ── Knowledge ─────────────────────────────────────────────────────────────
  {
    path: "/api/knowledge",
    methods: ["GET", "POST"],
    group: "Knowledge",
    description: "List or create knowledge sources",
  },
  {
    path: "/api/knowledge/[id]",
    methods: ["GET", "DELETE"],
    group: "Knowledge",
    description: "Get or delete a knowledge source",
  },
  {
    path: "/api/knowledge/[id]/sync",
    methods: ["POST"],
    group: "Knowledge",
    description: "Trigger knowledge source sync",
  },
  {
    path: "/api/knowledge/files",
    methods: ["GET", "POST"],
    group: "Knowledge",
    subgroup: "Files",
    description: "List or upload knowledge files",
  },
  {
    path: "/api/knowledge/files/[fileId]",
    methods: ["DELETE"],
    group: "Knowledge",
    subgroup: "Files",
    description: "Delete a knowledge file",
  },

  // ── Server & settings ─────────────────────────────────────────────────────
  {
    path: "/api/server",
    methods: ["GET"],
    group: "Server",
    description: "Server info and diagnostics",
  },
  {
    path: "/api/server/settings",
    methods: ["GET", "PUT"],
    group: "Server",
    description: "Server connection settings",
  },
  {
    path: "/api/server/smtp",
    methods: ["GET", "PUT", "POST"],
    group: "Server",
    subgroup: "SMTP",
    description: "SMTP email configuration",
  },
  {
    path: "/api/server/entra",
    methods: ["GET", "PUT", "POST"],
    group: "Server",
    subgroup: "Entra ID",
    description: "Microsoft Entra ID configuration",
  },
  {
    path: "/api/server/entra/unclaimed",
    methods: ["GET"],
    group: "Server",
    subgroup: "Entra ID",
    description: "List unclaimed Entra identities",
  },
  {
    path: "/api/server/entra/sync",
    methods: ["POST"],
    group: "Server",
    subgroup: "Entra ID",
    description: "Trigger Entra sync",
  },
  {
    path: "/api/server/entra/send-qr",
    methods: ["POST"],
    group: "Server",
    subgroup: "Entra ID",
    description: "Send QR code to Entra user",
  },
  {
    path: "/api/settings/storage",
    methods: ["GET", "PUT"],
    group: "Server",
    subgroup: "Storage",
    description: "Storage backend settings",
  },
  {
    path: "/api/settings/storage/test",
    methods: ["POST"],
    group: "Server",
    subgroup: "Storage",
    description: "Test storage connection",
  },
  {
    path: "/api/settings/storage/migrate",
    methods: ["POST"],
    group: "Server",
    subgroup: "Storage",
    description: "Migrate storage backend",
  },
  {
    path: "/api/settings/storage/location",
    methods: ["PATCH"],
    group: "Server",
    subgroup: "Storage",
    description: "Update storage location",
  },
  {
    path: "/api/settings/docling",
    methods: ["GET", "PUT"],
    group: "Server",
    subgroup: "Docling",
    description: "Docling document processing settings",
  },
  {
    path: "/api/settings/docling/test",
    methods: ["POST"],
    group: "Server",
    subgroup: "Docling",
    description: "Test Docling connection",
  },
  {
    path: "/api/settings/docling/location",
    methods: ["PATCH"],
    group: "Server",
    subgroup: "Docling",
    description: "Update Docling location",
  },

  // ── Network & graph ───────────────────────────────────────────────────────
  {
    path: "/api/network",
    methods: ["GET", "POST"],
    group: "Network",
    description: "Network topology",
  },
  {
    path: "/api/graph",
    methods: ["GET"],
    group: "Network",
    description: "Agent graph data",
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  {
    path: "/api/stats/tokens",
    methods: ["GET"],
    group: "Stats",
    description: "Token usage statistics",
  },

  // ── Chat ──────────────────────────────────────────────────────────────────
  {
    path: "/api/chat",
    methods: ["POST"],
    group: "Chat",
    description: "Chat with an agent (streaming)",
  },

  // ── API Keys ──────────────────────────────────────────────────────────────
  {
    path: "/api/api-keys",
    methods: ["GET", "POST"],
    group: "API Keys",
    description: "List or create API keys",
  },
  {
    path: "/api/api-keys/[id]",
    methods: ["PATCH", "DELETE"],
    group: "API Keys",
    description: "Update or revoke an API key",
  },
];

/** Convenience helper: get unique group names in the order they appear */
export function getRouteGroups(): string[] {
  return [
    ...new Set(ROUTE_REGISTRY.filter((r) => !r.isPublic).map((r) => r.group)),
  ];
}

/** Get all non-public routes for a given group */
export function getRoutesByGroup(group: string): RouteEntry[] {
  return ROUTE_REGISTRY.filter((r) => r.group === group && !r.isPublic);
}
