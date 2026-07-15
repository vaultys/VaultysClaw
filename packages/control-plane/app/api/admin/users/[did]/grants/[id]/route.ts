/**
 * DELETE /api/admin/users/[did]/grants/[id]
 * Revoke a delegation grant. Deletes the delegation cert and notifies the
 * affected agent. Owner-only.
 */

import { APIException } from "@/lib/api/utils/api-utils";
import { getAuthContext } from "@/lib/auth-utils";
import { getWSServer } from "@/lib/ws-server";
import { GrantDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { enqueueNotification } from "@/lib/notification-queue";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.users, {
  revokeGrant: async ({ params, request }) => {
    const auth = await getAuthContext(request);
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

    void enqueueNotification({
      eventType: "grant.revoked",
      data: { targetUserId: params.did, agentDid, actorDid: auth.did },
    });

    return { status: 200, body: { ok: true } };
  },
});

export const DELETE = handlers.DELETE!;
