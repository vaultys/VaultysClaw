import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { WorkspaceDAO } from "@/db/workspace.dao";
import { signEnrollmentToken } from "@/lib/agent-enrollment";

/**
 * Issues a one-time signed enrollment token so a user can launch a local
 * ("local AI") agent that self-registers over WebSocket and is auto-bound to
 * the user's personal workspace on admin approval. See lib/agent-enrollment.ts
 * and the enrollment handling in lib/ws-server.ts.
 */
const handlers = createNextRoute(userContract.agents, {
  createEnrollment: async ({ request }) => {
    const auth = await getAuthContext(request);

    const workspace = await WorkspaceDAO.findPersonalWorkspace(auth.userId);
    if (!workspace)
      throw new APIException(
        "FORBIDDEN",
        "No personal workspace found for this user"
      );

    const token = signEnrollmentToken({
      userId: auth.userId,
      workspaceId: workspace.id,
    });

    const wsPort = parseInt(process.env.WS_PORT || "8080", 10);

    return {
      status: 200,
      body: { token, workspaceName: workspace.name, wsPort },
    };
  },
});

export const POST = handlers.POST!;
