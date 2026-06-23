import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { RealmSkillDAO } from "@/db";
import { realmsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(realmsContract, {
  // ── GET /api/realms/:id/skills/:skillId — skill detail ────────────────────
  getSkill: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAccessRealm(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const skill = await RealmSkillDAO.findById(params.skillId);
    if (!skill || skill.realmId !== params.id) {
      throw new APIException("NOT_FOUND", "Skill not found");
    }

    return { status: 200, body: { skill } };
  },

  // ── PATCH /api/realms/:id/skills/:skillId — update skill metadata ─────────
  updateSkill: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const skill = await RealmSkillDAO.findById(params.skillId);
    if (!skill || skill.realmId !== params.id) {
      throw new APIException("NOT_FOUND", "Skill not found");
    }

    const updates: Parameters<typeof RealmSkillDAO.update>[1] = {};
    if ("description" in body) updates.description = body.description ?? null;
    if ("version" in body) updates.version = body.version ?? null;
    if ("isRequired" in body) updates.isRequired = body.isRequired;
    if ("config" in body) updates.config = body.config;
    if ("content" in body) updates.content = body.content ?? null;

    await RealmSkillDAO.update(params.skillId, updates);
    broadcastSkillsConfig(params.id);

    const updated = await RealmSkillDAO.findById(params.skillId);
    if (!updated) throw new APIException("NOT_FOUND", "Skill not found");
    return { status: 200, body: { skill: updated } };
  },

  // ── DELETE /api/realms/:id/skills/:skillId — remove from realm ────────────
  deleteSkill: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id))) {
      throw new APIException("FORBIDDEN");
    }

    const skill = await RealmSkillDAO.findById(params.skillId);
    if (!skill || skill.realmId !== params.id) {
      throw new APIException("NOT_FOUND", "Skill not found");
    }

    await RealmSkillDAO.delete(params.skillId);
    broadcastSkillsConfig(params.id);

    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
