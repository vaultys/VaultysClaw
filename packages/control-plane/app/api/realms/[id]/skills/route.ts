import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound, malformed } from "@/lib/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { RealmDAO, RealmSkillDAO } from "@/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/realms/[id]/skills — list all skills defined for a realm.
 * Requires realm membership.
 */
/**
 * @openapi
 * /api/realms/{id}/skills:
 *   get:
 *     summary: List all skills defined for a realm.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Realm ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of skills for the specified realm.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skills:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       realmId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       version:
 *                         type: string
 *                       isRequired:
 *                         type: boolean
 *                       config:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch realm skills.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  if (!(await auth.canAccessRealm(id))) return forbidden();

  const realm = await RealmDAO.findById(id);
  if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const skills = (await RealmSkillDAO.findAll(id)).map((s) => ({
    id: s.id,
    realmId: s.realmId,
    name: s.name,
    description: s.description,
    version: s.version,
    isRequired: s.isRequired,
    config: s.config,
    createdAt: s.createdAt,
  }));

  return NextResponse.json({ skills });
}

/**
 * POST /api/realms/[id]/skills — register a skill for this realm.
 * Requires realm admin or global admin.
 * Body: { name, description?, version?, isRequired?, config? }
 */
/**
 * @openapi
 * /api/realms/{id}/skills:
 *   post:
 *     summary: Register a skill for a realm.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Realm ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               version:
 *                 type: string
 *               isRequired:
 *                 type: boolean
 *               config:
 *                 type: object
 *     responses:
 *       201:
 *         description: Skill successfully registered.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skill:
 *                   $ref: '#/components/schemas/Skill'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: A skill with this name already exists in this realm.
 *       500:
 *         description: Failed to create realm skill.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const realm = await RealmDAO.findById(id);
  if (!realm) return notFound("Realm not found");

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    version?: string;
    isRequired?: boolean;
    config?: Record<string, unknown>;
  };

  if (!body.name?.trim()) {
    return malformed("name is required");
  }

  const skill = await RealmSkillDAO.create({
    realmId: id,
    name: body.name.trim(),
    description: body.description?.trim(),
    version: body.version?.trim(),
    isRequired: body.isRequired ?? false,
    config: body.config ?? {},
  });

  // Push updated skills config to all agents in this realm
  broadcastSkillsConfig(id);

  return NextResponse.json(
    {
      skill: {
        id: skill.id,
        realmId: skill.realmId,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        isRequired: skill.isRequired,
        config: skill.config,
        createdAt: skill.createdAt,
      },
    },
    { status: 201 }
  );
}
