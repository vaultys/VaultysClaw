/**
 * GET    /api/org/skills/[id]   — get one org skill
 * PATCH  /api/org/skills/[id]   — update an org skill (global admin only)
 * DELETE /api/org/skills/[id]   — remove from catalog (global admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { OrgSkillDAO } from "@/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * @openapi
 * /api/org/skills/{id}:
 *   get:
 *     summary: Retrieve a specific organization skill by ID.
 *     tags: [OrgSkills]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the organization skill.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A skill object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skill:
 *                   $ref: '#/components/schemas/OrgSkill'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const skill = await OrgSkillDAO.findById(id);
  if (!skill) return notFound("Skill not found");

  return NextResponse.json({ skill });
}

/**
 * @openapi
 * /api/org/skills/{id}:
 *   patch:
 *     summary: Update an organization skill.
 *     tags: [OrgSkills]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the organization skill to update.
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
 *               icon:
 *                 type: string
 *                 nullable: true
 *               content:
 *                 type: string
 *                 nullable: true
 *               configSchema:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Skill updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrgSkill'
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
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  if (!(await OrgSkillDAO.findById(id))) return notFound("Skill not found");

  const body = (await req.json()) as {
    description?: string | null;
    version?: string;
    icon?: string | null;
    content?: string | null;
    configSchema?: Record<string, unknown>;
  };

  await OrgSkillDAO.update(id, {
    description: body.description,
    version: body.version,
    icon: body.icon,
    content: body.content,
    configSchema: body.configSchema,
  });

  return NextResponse.json({ skill: await OrgSkillDAO.findById(id) });
}

/**
 * @openapi
 * /api/org/skills/{id}:
 *   delete:
 *     summary: Remove an organization skill from the catalog.
 *     tags: [OrgSkills]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the organization skill to delete.
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
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  if (!(await OrgSkillDAO.findById(id))) return notFound("Skill not found");

  await OrgSkillDAO.delete(id);
  return NextResponse.json({ success: true });
}
