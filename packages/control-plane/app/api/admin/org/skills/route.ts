/**
 * POST /api/admin/org/skills — add a new skill to the catalog (global admin only).
 */

import { APIException } from "@/lib/api/utils/api-utils";
import { OrgSkillDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { adminContract } from "@/lib/contracts";

const handlers = createNextRoute(adminContract.orgSkills, {
  create: async ({ body }) => {

    if (!body.name?.trim()) throw new APIException("MALFORMED", "Name is required");

    try {
      const skill = await OrgSkillDAO.create({
        name: body.name.trim(),
        description: body.description?.trim(),
        version: body.version?.trim(),
        icon: body.icon?.trim(),
        content: body.content ?? undefined,
        configSchema: body.configSchema,
      });
      return { status: 201, body: { skill } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE"))
        throw new APIException(
          "CONFLICT",
          `Skill "${body.name}" already exists in the catalog`
        );
      throw new APIException("INTERNAL_ERROR", "Failed to create skill");
    }
  },
});

export const POST = handlers.POST!;
