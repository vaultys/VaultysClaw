/**
 * GET  /api/org/skills   — list the org skill catalog
 * POST /api/org/skills   — add a new skill to the catalog (global admin only)
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { OrgSkillDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.orgSkills, {
  // ── GET /api/org/skills ───────────────────────────────────────────────────
  list: async ({ request }) => {
    await getAuthContext(request);
    return { status: 200, body: { skills: await OrgSkillDAO.findAll() } };
  },

  // ── POST /api/org/skills ──────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

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

export const GET = handlers.GET!;
export const POST = handlers.POST!;
