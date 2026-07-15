import { isAdminRole } from "@/lib/roles";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";
import { GrantDAO, IntentDAO, WorkspaceDAO } from "@/db";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.intents, {
  // ── POST /api/intents ─────────────────────────────────────────────────────
  // Owners can send any intent; non-owners must have an active grant covering
  // the target agent + action (capability).
  send: async ({ body }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw new APIException("UNAUTHORIZED");

    const { agentId, action, params, broadcastCapability } = body;

    // Non-owner delegation check
    if (!isAdminRole(session.user.role)) {
      if (!session.user.did)
        throw new APIException("FORBIDDEN", "User account does not have a DID");
      const capability = action ?? broadcastCapability;
      if (!capability)
        throw new APIException(
          "MALFORMED",
          "action or broadcastCapability required"
        );

      const targetAgentId = agentId ?? null;
      const grants = await GrantDAO.listByUser(session.user.did);
      const hasGrant = grants.some((g) => {
        const caps = g.capabilities as string[];
        const agentMatch = g.agentDid === null || g.agentDid === targetAgentId;
        const capMatch = caps.includes(capability);
        const notExpired = !g.expiresAt || new Date(g.expiresAt) > new Date();
        return agentMatch && capMatch && notExpired;
      });
      if (!hasGrant)
        throw new APIException(
          "FORBIDDEN",
          "No grant found for this agent/capability"
        );
    }

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not initialized");

    const intentId = `intent-${Date.now()}`;
    let sentTo: string[] = [];
    // Pass userDid for delegation verification when the caller is not the owner
    const intentUserDid = isAdminRole(session.user.role)
      ? undefined
      : (session.user.did ?? undefined);

    const resolvedAction = action ?? broadcastCapability ?? "";
    const resolvedParams = params ?? {};

    if (broadcastCapability) {
      sentTo = await wsServer.broadcastIntentToCapability(
        broadcastCapability,
        intentId,
        resolvedAction,
        resolvedParams,
        intentUserDid
      );
      if (sentTo.length === 0)
        throw new APIException(
          "NOT_FOUND",
          "No agents with required capability"
        );
    } else if (agentId) {
      const success = wsServer.sendIntentToAgent(
        agentId,
        intentId,
        resolvedAction,
        resolvedParams,
        intentUserDid
      );
      if (!success)
        throw new APIException("NOT_FOUND", "Agent not found or not connected");
      sentTo = [agentId];
    } else {
      throw new APIException(
        "MALFORMED",
        "Must specify agentId or broadcastCapability"
      );
    }

    return {
      status: 202,
      body: {
        intentId,
        action: resolvedAction,
        sentTo,
        count: sentTo.length,
      },
    };
  },

  // ── GET /api/intents ──────────────────────────────────────────────────────
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const limit = Math.min(query.limit ?? 100, 500);
    const agentDid = query.agentDid;

    let allowedAgentDids: Set<string> | undefined;
    if (!auth.isGlobalAdmin) {
      if (auth.workspaceIds.size === 0) {
        allowedAgentDids = new Set(); // no workspaces → no agents → no intents
      } else {
        const perWorkspace = await Promise.all(
          [...auth.workspaceIds].map((id) => WorkspaceDAO.getAgents(id))
        );
        allowedAgentDids = new Set(
          perWorkspace.flat().map((ra) => ra.agent.did)
        );
      }
    }

    const rows = await IntentDAO.findAll(limit, agentDid, allowedAgentDids);
    const intents = rows.map((r) => ({
      intentId: r.intentId,
      agentDid: r.agentDid,
      action: r.action,
      params: r.params ? (r.params as Record<string, unknown>) : {},
      status: r.status,
      output: r.output ? (r.output as Record<string, unknown>) : null,
      error: r.error,
      sentAt:
        r.sentAt instanceof Date ? r.sentAt.toISOString() : String(r.sentAt),
      completedAt:
        r.completedAt instanceof Date
          ? r.completedAt.toISOString()
          : (r.completedAt ?? null),
    }));

    return { status: 200, body: { intents } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
