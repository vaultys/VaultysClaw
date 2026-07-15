import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, SkillOverrideDAO } from "@/db";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * GET /api/agents/:did/skills — the effective skills of an agent the caller can
 * access. Gated by `canAccessAgent` (admins pass too). Overriding a skill is
 * admin-only and stays under /api/admin/agents/:did/skills.
 */
const handlers = createNextRoute(userContract.agents, {
  getSkills: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!(await auth.canAccessAgent(did))) throw new APIException("FORBIDDEN");

    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const skills = await SkillOverrideDAO.getEffectiveSkills(did);
    return { status: 200, body: { skills } };
  },
});

export const GET = handlers.GET!;
