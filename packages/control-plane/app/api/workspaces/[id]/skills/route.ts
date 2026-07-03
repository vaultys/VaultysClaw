import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { WorkspaceDAO, WorkspaceSkillDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.workspaces, {
  // ── GET /api/workspaces/:id/skills — skills defined for a workspace ───────────────
  listSkills: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAccessWorkspace(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const skills = await WorkspaceSkillDAO.findAll(params.id);
    return { status: 200, body: { skills } };
  },

  // ── POST /api/workspaces/:id/skills — register a skill for this workspace ─────────
  createSkill: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const name = body.name.trim();
    if (!name) throw new APIException("MALFORMED", "name is required");

    const skill = await WorkspaceSkillDAO.create({
      workspaceId: params.id,
      name,
      description: body.description?.trim(),
      version: body.version?.trim(),
      isRequired: body.isRequired ?? false,
      config: body.config ?? {},
    });

    broadcastSkillsConfig(params.id);
    return { status: 201, body: { skill } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
