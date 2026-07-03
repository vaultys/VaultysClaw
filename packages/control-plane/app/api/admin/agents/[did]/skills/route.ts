import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { sendSkillsConfig } from "@/lib/ws-server";
import { AgentDAO, WorkspaceSkillDAO, SkillOverrideDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.agents, {
  getSkills: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!(await auth.canAccessAgent(did))) throw new APIException("FORBIDDEN");

    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const skills = await SkillOverrideDAO.getEffectiveSkills(did);
    return { status: 200, body: { skills } };
  },

  updateSkillOverride: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const skill = await WorkspaceSkillDAO.findById(body.workspaceSkillId);
    if (!skill) throw new APIException("NOT_FOUND", "Skill not found");
    if (skill.isRequired && !body.enabled)
      throw new APIException("MALFORMED", "Cannot disable a required skill");

    await SkillOverrideDAO.set(did, body.workspaceSkillId, body.enabled);
    sendSkillsConfig(did);

    return {
      status: 200,
      body: { skills: await SkillOverrideDAO.getEffectiveSkills(did) },
    };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
