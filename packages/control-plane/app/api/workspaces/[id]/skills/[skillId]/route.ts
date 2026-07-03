import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { WorkspaceSkillDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.workspaces, {
  // ── GET /api/workspaces/:id/skills/:skillId — skill detail ────────────────────
  getSkill: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAccessWorkspace(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const skill = await WorkspaceSkillDAO.findById(params.skillId);
    if (!skill || skill.workspaceId !== params.id) {
      throw new APIException("NOT_FOUND", "Skill not found");
    }

    return { status: 200, body: { skill } };
  },

  // ── PATCH /api/workspaces/:id/skills/:skillId — update skill metadata ─────────
  updateSkill: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const skill = await WorkspaceSkillDAO.findById(params.skillId);
    if (!skill || skill.workspaceId !== params.id) {
      throw new APIException("NOT_FOUND", "Skill not found");
    }

    const updates: Parameters<typeof WorkspaceSkillDAO.update>[1] = {};
    if ("description" in body) updates.description = body.description ?? null;
    if ("version" in body) updates.version = body.version ?? null;
    if ("isRequired" in body) updates.isRequired = body.isRequired;
    if ("config" in body) updates.config = body.config;
    if ("content" in body) updates.content = body.content ?? null;

    await WorkspaceSkillDAO.update(params.skillId, updates);
    broadcastSkillsConfig(params.id);

    const updated = await WorkspaceSkillDAO.findById(params.skillId);
    if (!updated) throw new APIException("NOT_FOUND", "Skill not found");
    return { status: 200, body: { skill: updated } };
  },

  // ── DELETE /api/workspaces/:id/skills/:skillId — remove from workspace ────────────
  deleteSkill: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const skill = await WorkspaceSkillDAO.findById(params.skillId);
    if (!skill || skill.workspaceId !== params.id) {
      throw new APIException("NOT_FOUND", "Skill not found");
    }

    await WorkspaceSkillDAO.delete(params.skillId);
    broadcastSkillsConfig(params.id);

    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
