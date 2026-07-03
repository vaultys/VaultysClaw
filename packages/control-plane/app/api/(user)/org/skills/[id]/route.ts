/**
 * GET /api/org/skills/[id] — get one org skill (any authenticated user).
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { OrgSkillDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.orgSkills, {
  getOne: async ({ params, request }) => {
    await getAuthContext(request);
    const skill = await OrgSkillDAO.findById(params.id);
    if (!skill) throw new APIException("NOT_FOUND", "Skill not found");
    return { status: 200, body: { skill } };
  },
});

export const GET = handlers.GET!;
