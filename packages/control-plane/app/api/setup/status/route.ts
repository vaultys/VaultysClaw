import { getSmtpConfig } from "@/lib/smtp";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, ModelDAO, WorkspaceDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  publicContract,
} from "@/lib/contracts";

/** GET /api/setup/status — check which setup steps are completed. Admin only. */
const handlers = createNextRoute(publicContract.setup, {
  status: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const allAgents = await AgentDAO.findAll();
    const defaultWorkspace = await WorkspaceDAO.findDefault();
    const workspaceUsers = defaultWorkspace
      ? await WorkspaceDAO.getUsers(defaultWorkspace.id)
      : [];

    return {
      status: 200,
      body: {
        status: {
          model: (await ModelDAO.findAll()).length > 0,
          email: getSmtpConfig() !== null,
          users: workspaceUsers.length > 1, // More than just the admin
          agent: allAgents.length > 0,
        },
      },
    };
  },
});

export const GET = handlers.GET!;
