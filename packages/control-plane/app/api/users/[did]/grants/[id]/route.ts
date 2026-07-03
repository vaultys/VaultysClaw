/**
 * DELETE /api/users/[did]/grants/[id]
 * Revoke a delegation grant. Deletes the delegation cert and notifies the
 * affected agent. Owner-only.
 */

import { isAdminRole } from "@/lib/roles";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { GrantDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.users, {
  revokeGrant: async ({ params }) => {
    const session = await getServerSession(authOptions);
    if (!isAdminRole(session?.user?.role)) throw new APIException("FORBIDDEN");

    const grant = await GrantDAO.findById(params.id);
    if (!grant || grant.userDid !== params.did)
      throw new APIException("NOT_FOUND", "Grant not found");

    const agentDid = grant.agentDid; // null = wildcard

    // Cascade delete handles delegation certs via DB relation
    await GrantDAO.delete(params.id);

    // Push updated (empty or reduced) delegation set to affected agent(s)
    const wsServer = getWSServer();
    if (wsServer) {
      if (agentDid) wsServer.pushDelegationUpdate(agentDid);
      else wsServer.pushDelegationUpdateAll();
    }

    return { status: 200, body: { ok: true } };
  },
});

export const DELETE = handlers.DELETE!;
