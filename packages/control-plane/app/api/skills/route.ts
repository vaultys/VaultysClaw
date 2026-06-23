import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { RealmDAO, RealmSkillDAO } from "@/db";
import { skillsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(skillsContract, {
  // ── GET /api/skills — every realm skill, enriched with realm + usage info ─
  list: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const rows = await RealmSkillDAO.findAllWithRealms();
    return { status: 200, body: rows };
  },

  // ── POST /api/skills — register a skill in a realm ────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const name = body.name.trim();
    if (!name) throw new APIException("MALFORMED", "name must not be empty");

    const realm = await RealmDAO.findById(body.realmId);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const existing = await RealmSkillDAO.findAll(body.realmId);
    if (existing.some((s) => s.name === name)) {
      throw new APIException(
        "CONFLICT",
        `Skill '${name}' already exists in this realm`
      );
    }

    const skill = await RealmSkillDAO.create({
      realmId: body.realmId,
      name,
      description: body.description?.trim() || undefined,
      version: body.version?.trim() || undefined,
      isRequired: body.isRequired === true,
      config: body.config ?? {},
      content: body.content ?? undefined,
    });
    broadcastSkillsConfig(body.realmId);
    return { status: 201, body: skill };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
