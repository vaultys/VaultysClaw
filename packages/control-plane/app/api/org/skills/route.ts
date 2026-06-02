/**
 * GET  /api/org/skills   — list the org skill catalog
 * POST /api/org/skills   — add a new skill to the catalog (global admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrgSkills, createOrgSkill } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * @openapi
 * /api/org/skills:
 *   get:
 *     summary: List the organization skill catalog.
 *     tags: [OrgSkills]
 *     responses:
 *       200:
 *         description: A list of skills in the organization catalog.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skills:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  return NextResponse.json({ skills: getOrgSkills() });
}

/**
 * @openapi
 * /api/org/skills:
 *   post:
 *     summary: Add a new skill to the catalog.
 *     tags: [Org]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the skill.
 *               description:
 *                 type: string
 *                 description: A brief description of the skill.
 *               version:
 *                 type: string
 *                 description: The version of the skill.
 *               icon:
 *                 type: string
 *                 description: The icon URL of the skill.
 *               content:
 *                 type: string
 *                 description: The content of the skill.
 *               configSchema:
 *                 type: object
 *                 additionalProperties: true
 *                 description: The configuration schema for the skill.
 *     responses:
 *       201:
 *         description: Skill created successfully.
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
 *       409:
 *         description: Skill already exists in the catalog.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 *       500:
 *         description: Failed to create skill.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    version?: string;
    icon?: string;
    content?: string;
    configSchema?: Record<string, unknown>;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const skill = createOrgSkill({
      name: body.name.trim(),
      description: body.description?.trim(),
      version: body.version?.trim(),
      icon: body.icon?.trim(),
      content: body.content ?? undefined,
      configSchema: body.configSchema,
    });
    return NextResponse.json({ skill }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      return NextResponse.json(
        { error: `Skill "${body.name}" already exists in the catalog` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create skill" },
      { status: 500 }
    );
  }
}
