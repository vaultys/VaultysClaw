import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { PolicyDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
  type PolicyEntry,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.policies, {
  // ── GET /api/policies/:id ─────────────────────────────────────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const policy = await PolicyDAO.findById(params.id);
    if (!policy) throw new APIException("NOT_FOUND", "Policy not found");

    const entry: PolicyEntry = {
      id: policy.id,
      agentDid: policy.agentDid,
      workspaceId: policy.workspaceId,
      capabilities: (policy.capabilities ?? []) as string[],
      resourceLimits: (policy.resourceLimits ??
        null) as PolicyEntry["resourceLimits"],
      expiresAt: policy.expiresAt
        ? new Date(policy.expiresAt).toISOString()
        : null,
      createdBy: policy.createdBy,
      createdAt: new Date(policy.createdAt).toISOString(),
    };

    return { status: 200, body: { policy: entry } };
  },

  // ── DELETE /api/policies/:id ──────────────────────────────────────────────
  // Revoke a policy. If it was bound to a connected agent, reissue its cert
  // with an empty capability set so the removed limits take effect immediately.
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const policy = await PolicyDAO.findById(params.id);
    if (!policy) throw new APIException("NOT_FOUND", "Policy not found");

    const deleted = await PolicyDAO.delete(params.id);
    if (!deleted) throw new APIException("NOT_FOUND", "Policy not found");

    const sentTo: string[] = [];
    if (policy.agentDid) {
      const wsServer = getWSServer();
      if (wsServer) {
        const applied = await wsServer.applyPolicy(policy.agentDid, [], {
          resourceLimits: null,
          policyId: null,
          policyExpiresAt: null,
        });
        if (applied) sentTo.push(policy.agentDid);
      }
    }

    return { status: 200, body: { ok: true, sentTo } };
  },
});

export const GET = handlers.GET!;
export const DELETE = handlers.DELETE!;
