import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { OrgSkillDAO } from "@/db";
import { skillsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(skillsContract, {
  // ── GET /api/skills/library/content?skillId=<name> ────────────────────────
  // Returns the markdown instructions for an org skill, keyed by its name.
  libraryContent: async ({ query, request }) => {
    await getAuthContext(request);

    const skill = await OrgSkillDAO.findByName(query.skillId);
    if (!skill || !skill.content) {
      throw new APIException("NOT_FOUND", "Skill content not found");
    }

    return { status: 200, body: { content: skill.content } };
  },
});

export const GET = handlers.GET!;
