import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** A Prisma workspace enriched with member and workflow counts (list endpoint). */
export type WorkspaceWithCounts = Prisma.WorkspaceGetPayload<{
  include: {
    _count: {
      select: {
        agentWorkspaces: true;
        userWorkspaces: true;
        workflows: true;
      };
    };
  };
}>;

/** Full workspace detail returned by GET /api/workspaces/:id. */

export type WorkspaceDetail = Prisma.WorkspaceGetPayload<{
  include: {
    agentWorkspaces: {
      include: {
        workspace: true;
        agent: true;
      };
    };
    userWorkspaces: {
      include: {
        workspace: true;
        user: true;
      };
    };
    workflows: true;
    tokenUsage: true;
  };
}>;

/** Models available to a workspace plus its LiteLLM router key info. */
export type WorkspaceModelsResponse = {
  models: Array<Record<string, unknown>>;
  litellmConfigured: boolean;
  routerKey: {
    hasVirtualKey: boolean;
    keyPrefix: string | null;
    allowedModels: string[];
    monthlyBudgetUsd: number | null;
    updatedAt: string | null;
  } | null;
};

/** Credential metadata listing for a workspace. */
export type WorkspaceCredentialsResponse = {
  credentials: Array<Record<string, unknown>>;
};

export type UserWorkspaceWithWorkspace = Prisma.UserWorkspaceGetPayload<{
  include: {
    workspace: true;
  };
}>;
