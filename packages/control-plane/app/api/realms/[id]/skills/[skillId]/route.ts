import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { RealmSkillDAO } from "@/db";

type Ctx = { params: Promise<{ id: string; skillId: string }> };

/**
 * GET /api/realms/[id]/skills/[skillId] — get skill detail.
 */
/**
 * @openapi
 * /api/realms/{id}/skills/{skillId}:
 *   get:
 *     summary: Retrieve skill details by skill ID.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Realm ID
 *         schema:
 *           type: string
 *       - name: skillId
 *         in: path
 *         required: true
 *         description: Skill ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Skill details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skill:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     realmId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     version:
 *                       type: string
 *                     isRequired:
 *                       type: boolean
 *                     config:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch skill.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id, skillId } = await ctx.params;
  if (!(await auth.canAccessRealm(id))) return forbidden();

  const skill = await RealmSkillDAO.findById(skillId);
  if (!skill || skill.realmId !== id) {
    return notFound("Skill not found");
  }

  return NextResponse.json({
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
  });
}

/**
 * PATCH /api/realms/[id]/skills/[skillId] — update skill metadata.
 * Requires realm admin or global admin.
 * Body: { description?, version?, isRequired?, config? }
 */
/**
 * @openapi
 * /api/realms/{id}/skills/{skillId}:
 *   patch:
 *     summary: Update skill metadata.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: skillId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 nullable: true
 *               version:
 *                 type: string
 *                 nullable: true
 *               isRequired:
 *                 type: boolean
 *               config:
 *                 type: object
 *                 additionalProperties: true
 *               content:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Skill updated successfully.
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
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id, skillId } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const skill = await RealmSkillDAO.findById(skillId);
  if (!skill || skill.realmId !== id) {
    return notFound("Skill not found");
  }

  const body = (await req.json()) as {
    description?: string | null;
    version?: string | null;
    isRequired?: boolean;
    config?: Record<string, unknown>;
    content?: string | null;
  };

  const updates: Parameters<typeof RealmSkillDAO.update>[1] = {};
  if ("description" in body) updates.description = body.description ?? null;
  if ("version" in body) updates.version = body.version ?? null;
  if ("isRequired" in body) updates.isRequired = body.isRequired;
  if ("config" in body) updates.config = body.config;
  if ("content" in body) updates.content = body.content ?? null;

  await RealmSkillDAO.update(skillId, updates);

  broadcastSkillsConfig(id);

  const updated = await RealmSkillDAO.findById(skillId);
  if (!updated) {
    return notFound("Skill not found");
  }
  return NextResponse.json({
    skill: {
      id: updated.id,
      realmId: updated.realmId,
      name: updated.name,
      description: updated.description,
      version: updated.version,
      isRequired: updated.isRequired,
      config: updated.config,
      createdAt: updated.createdAt,
    },
  });
}

/**
 * DELETE /api/realms/[id]/skills/[skillId] — remove a skill from the realm.
 * Requires realm admin or global admin.
 */
/**
 * @openapi
 * /api/realms/{id}/skills/{skillId}:
 *   delete:
 *     summary: Remove a skill from the realm.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Realm ID
 *         schema:
 *           type: string
 *       - name: skillId
 *         in: path
 *         required: true
 *         description: Skill ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Skill successfully deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete skill.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id, skillId } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const skill = await RealmSkillDAO.findById(skillId);
  if (!skill || skill.realmId !== id) {
    return notFound("Skill not found");
  }

  await RealmSkillDAO.delete(skillId);
  broadcastSkillsConfig(id);

  return NextResponse.json({ ok: true });
}
