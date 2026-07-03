/**
 * GET  /api/users/[did]/grants  — list grants for a user
 * POST /api/users/[did]/grants  — create a grant + sign delegation cert + push to agent
 * Owner-only.
 */

import { isAdminRole } from "@/lib/roles";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { APIException } from "@/lib/api/utils/api-utils";
import { signDelegation } from "@/lib/delegation";
import { getWSServer } from "@/lib/ws-server";
import type { AgentCapability } from "@vaultysclaw/shared";
import { DelegationCertDAO, GrantDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
  type UserGrant,
} from "@/lib/contracts";

function toGrant(g: Awaited<ReturnType<typeof GrantDAO.findById>>): UserGrant {
  return {
    id: g!.id,
    agentDid: g!.agentDid,
    capabilities: g!.capabilities as string[],
    grantedBy: g!.grantedBy,
    expiresAt: g!.expiresAt ? new Date(g!.expiresAt).toISOString() : null,
    createdAt: new Date(g!.createdAt).toISOString(),
  };
}

const handlers = createNextRoute(adminContract.users, {
  // ── GET /api/users/:did/grants ────────────────────────────────────────────
  listGrants: async ({ params }) => {
    const session = await getServerSession(authOptions);
    if (!isAdminRole(session?.user?.role)) throw new APIException("FORBIDDEN");

    const user = await UserDAO.findByDid(params.did);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const grants = (await GrantDAO.listByUser(params.did)).map((g) =>
      toGrant(g)
    );
    return { status: 200, body: { grants } };
  },

  // ── POST /api/users/:did/grants ───────────────────────────────────────────
  createGrant: async ({ params, body }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user || !isAdminRole(session.user.role))
      throw new APIException("FORBIDDEN");

    const user = await UserDAO.findByDid(params.did);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    if (!Array.isArray(body.capabilities) || body.capabilities.length === 0)
      throw new APIException("MALFORMED", "capabilities must be a non-empty array");

    const capabilities = body.capabilities as AgentCapability[];
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
    const agentDid = body.agentDid ?? null; // null = all agents

    const grant = await GrantDAO.create({
      id: crypto.randomUUID(),
      userDid: params.did,
      agentDid: agentDid ?? undefined,
      capabilities,
      grantedBy: session.user.did ?? "",
      expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
    });

    // Sign a delegation certificate for the target agent (or wildcard)
    const effectiveAgentDid = agentDid ?? "*";
    const certificate = await signDelegation(
      params.did,
      effectiveAgentDid,
      capabilities,
      expiresAt
    );

    await DelegationCertDAO.create({
      id: crypto.randomUUID(),
      grantId: grant.id,
      userDid: params.did,
      agentDid: effectiveAgentDid,
      capabilities,
      certificate,
      expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
    });

    // Push delegation_update to the affected agent(s)
    const wsServer = getWSServer();
    if (wsServer) {
      if (agentDid) wsServer.pushDelegationUpdate(agentDid);
      else wsServer.pushDelegationUpdateAll();
    }

    return { status: 201, body: { grant: toGrant(grant) } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
