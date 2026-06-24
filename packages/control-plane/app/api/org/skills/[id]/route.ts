/**
 * GET    /api/org/skills/[id]   — get one org skill
 * PATCH  /api/org/skills/[id]   — update an org skill (global admin only)
 * DELETE /api/org/skills/[id]   — remove from catalog (global admin only)
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { OrgSkillDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { orgSkillsContract } from "@/lib/contracts";

const handlers = createNextRoute(orgSkillsContract, {
  // ── GET /api/org/skills/:id ───────────────────────────────────────────────
  getOne: async ({ params, request }) => {
    await getAuthContext(request);
    const skill = await OrgSkillDAO.findById(params.id);
    if (!skill) throw new APIException("NOT_FOUND", "Skill not found");
    return { status: 200, body: { skill } };
  },

  // ── PATCH /api/org/skills/:id ─────────────────────────────────────────────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (!(await OrgSkillDAO.findById(params.id)))
      throw new APIException("NOT_FOUND", "Skill not found");

    await OrgSkillDAO.update(params.id, {
      description: body.description,
      version: body.version,
      icon: body.icon,
      content: body.content,
      configSchema: body.configSchema,
    });

    const skill = await OrgSkillDAO.findById(params.id);
    return { status: 200, body: { skill: skill! } };
  },

  // ── DELETE /api/org/skills/:id ────────────────────────────────────────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (!(await OrgSkillDAO.findById(params.id)))
      throw new APIException("NOT_FOUND", "Skill not found");

    await OrgSkillDAO.delete(params.id);
    return { status: 200, body: { success: true } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
