import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { RealmDAO, RealmSkillDAO } from "@/db";
import { realmsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(realmsContract, {
  // ── GET /api/realms/:id/skills — skills defined for a realm ───────────────
  listSkills: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAccessRealm(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const skills = await RealmSkillDAO.findAll(params.id);
    return { status: 200, body: { skills } };
  },

  // ── POST /api/realms/:id/skills — register a skill for this realm ─────────
  createSkill: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const name = body.name.trim();
    if (!name) throw new APIException("MALFORMED", "name is required");

    const skill = await RealmSkillDAO.create({
      realmId: params.id,
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
