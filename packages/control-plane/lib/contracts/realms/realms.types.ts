import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** A Prisma realm enriched with member and workflow counts (list endpoint). */
export type RealmWithCounts = Prisma.RealmGetPayload<{
  include: {
    _count: {
      select: {
        agentRealms: true;
        userRealms: true;
        workflows: true;
      };
    };
  };
}>;

/** Full realm detail returned by GET /api/realms/:id. */

export type RealmDetail = Prisma.RealmGetPayload<{
  include: {
    agentRealms: {
      include: {
        realm: true;
        agent: true;
      };
    };
    userRealms: {
      include: {
        realm: true;
        user: true;
      };
    };
    workflows: true;
    tokenUsage: true;
  };
}>;

/** Models available to a realm plus its LiteLLM router key info. */
export type RealmModelsResponse = {
  models: Array<Record<string, unknown>>;
  routerKey: {
    hasVirtualKey: boolean;
    allowedModels: string[];
    monthlyBudgetUsd: number;
  } | null;
};

/** Credential metadata listing for a realm. */
export type RealmCredentialsResponse = {
  credentials: Array<Record<string, unknown>>;
};

export type UserRealmWithRealm = Prisma.UserRealmGetPayload<{
  include: {
    realm: true;
  };
}>;
