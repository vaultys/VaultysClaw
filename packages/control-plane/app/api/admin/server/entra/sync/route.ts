/**
 * POST /api/admin/server/entra/sync — trigger a user sync from Microsoft Entra ID.
 * Admin-only.
 */

import { syncEntraUsers } from "@/lib/entra-sync";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.server, {
  entraSync: async ({ body }) => {

    const result = await syncEntraUsers({
      groupIds: body.groupIds ?? [],
      groupWorkspaceMap: body.groupWorkspaceMap ?? {},
      groupNames: body.groupNames ?? {},
    });
    return { status: 200, body: result as unknown as Record<string, unknown> };
  },
});

export const POST = handlers.POST!;
