/**
 * POST /api/server/entra/sync — trigger a user sync from Microsoft Entra ID.
 * Admin-only.
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { syncEntraUsers } from "@/lib/entra-sync";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { serverContract } from "@/lib/contracts";

const handlers = createNextRoute(serverContract, {
  entraSync: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const result = await syncEntraUsers({
      groupIds: body.groupIds ?? [],
      groupWorkspaceMap: body.groupWorkspaceMap ?? {},
      groupNames: body.groupNames ?? {},
    });
    return { status: 200, body: result as unknown as Record<string, unknown> };
  },
});

export const POST = handlers.POST!;
