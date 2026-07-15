/**
 * GET /api/org/skills — list the org skill catalog (any authenticated user).
 */

import { OrgSkillDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.orgSkills, {
  list: async ({ request }) => {
    return { status: 200, body: { skills: await OrgSkillDAO.findAll() } };
  },
});

export const GET = handlers.GET!;
