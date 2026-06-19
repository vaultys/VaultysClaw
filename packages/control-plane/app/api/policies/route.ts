import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import type { AgentCapability } from "@vaultysclaw/shared";
import { PolicyDAO } from "@/db";
import type { Policy } from "@prisma/client";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  policiesContract,
  type PolicyEntry,
  type PolicyResourceLimits,
} from "@/lib/contracts";

/** Serialize a Prisma Policy row to the wire shape (`PolicyEntry`). */
function toPolicyEntry(p: Policy): PolicyEntry {
  return {
    id: p.id,
    agentDid: p.agentDid,
    realmId: p.realmId,
    capabilities: (p.capabilities as string[]) ?? [],
    resourceLimits: (p.resourceLimits as PolicyResourceLimits | null) ?? null,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Routes for /api/policies — the collection slice of `policiesContract`
 * (list + create). Global admin only. The contract is the single source of
 * truth for request/response shapes.
 */
const handlers = createNextRoute(policiesContract, {
  // ── GET /api/policies ─────────────────────────────────────────────────────
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const policies = await PolicyDAO.list({
      agentDid: query.agentDid,
      realmId: query.realmId,
      includeExpired: query.includeExpired,
      expiredOnly: query.expiredOnly,
    });

    return { status: 200 as const, body: { policies: policies.map(toPolicyEntry) } };
  },

  // ── POST /api/policies ────────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { agentDid, realmId, capabilities, resourceLimits, expiresAt } = body;

    const policy = await PolicyDAO.create({
      agentDid: agentDid ?? undefined,
      realmId: realmId ?? undefined,
      capabilities,
      resourceLimits: resourceLimits ?? undefined,
      expiresAt: expiresAt ?? undefined,
      createdBy: auth.did,
    });

    // Apply via cert reissue so capabilities + limits are enforced immediately.
    const wsServer = getWSServer();
    const sentTo: string[] = [];

    if (wsServer && agentDid) {
      const policyMeta = {
        resourceLimits: resourceLimits ?? null,
        policyId: policy.id,
        policyExpiresAt: expiresAt ?? null,
      };
      const applied = await wsServer.applyPolicy(
        agentDid,
        capabilities as AgentCapability[],
        policyMeta
      );
      if (applied) sentTo.push(agentDid);
    }

    return {
      status: 201 as const,
      body: { policy: toPolicyEntry(policy), sentTo },
    };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
