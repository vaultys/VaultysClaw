import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { WorkspaceDAO, WorkspaceSkillDAO } from "@/db";
import { skillsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(skillsContract, {
  // ── GET /api/skills — every workspace skill, enriched with workspace + usage info ─
  list: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const rows = await WorkspaceSkillDAO.findAllWithWorkspaces();
    return { status: 200, body: rows };
  },

  // ── POST /api/skills — register a skill in a workspace ────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const name = body.name.trim();
    if (!name) throw new APIException("MALFORMED", "name must not be empty");

    const workspace = await WorkspaceDAO.findById(body.workspaceId);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const existing = await WorkspaceSkillDAO.findAll(body.workspaceId);
    if (existing.some((s) => s.name === name)) {
      throw new APIException(
        "CONFLICT",
        `Skill '${name}' already exists in this workspace`
      );
    }

    const skill = await WorkspaceSkillDAO.create({
      workspaceId: body.workspaceId,
      name,
      description: body.description?.trim() || undefined,
      version: body.version?.trim() || undefined,
      isRequired: body.isRequired === true,
      config: body.config ?? {},
      content: body.content ?? undefined,
    });
    broadcastSkillsConfig(body.workspaceId);
    return { status: 201, body: skill };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
