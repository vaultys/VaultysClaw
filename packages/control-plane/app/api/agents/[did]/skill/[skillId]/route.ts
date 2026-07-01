import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { sendSkillsConfig } from "@/lib/ws-server";
import { AgentDAO, WorkspaceSkillDAO, SkillOverrideDAO } from "@/db";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  updateSkill: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    const { did, skillId } = params;

    if (!(await auth.canAdminAgent(did))) throw new APIException("FORBIDDEN");

    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const skill = await WorkspaceSkillDAO.findById(skillId);
    if (!skill) throw new APIException("NOT_FOUND", "Skill not found");
    if (skill.isRequired && !body.enabled)
      throw new APIException("MALFORMED", "Cannot disable a required skill");

    await SkillOverrideDAO.set(did, skillId, body.enabled);
    sendSkillsConfig(did);

    return {
      status: 200,
      body: { skills: await SkillOverrideDAO.getEffectiveSkills(did) },
    };
  },
});

export const PATCH = handlers.PATCH!;
