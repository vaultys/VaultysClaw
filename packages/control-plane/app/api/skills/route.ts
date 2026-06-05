import { NextRequest, NextResponse } from "next/server";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { RealmDAO, RealmSkillDAO } from "@/db";

/**
 * @openapi
 * /api/skills:
 *   get:
 *     summary: Retrieve all skills with their associated realms.
 *     tags: [Skills]
 *     responses:
 *       200:
 *         description: A list of skills with realms.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Skill'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const rows = await RealmSkillDAO.findAllWithRealms();
  return NextResponse.json(rows);
}

/**
 * @openapi
 * /api/skills:
 *   post:
 *     summary: Create a new skill in a specified realm.
 *     tags: [Skills]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               realmId:
 *                 type: string
 *                 description: The ID of the realm.
 *               name:
 *                 type: string
 *                 description: The name of the skill.
 *               description:
 *                 type: string
 *                 description: The description of the skill.
 *               version:
 *                 type: string
 *                 description: The version of the skill.
 *               isRequired:
 *                 type: boolean
 *                 description: Whether the skill is required.
 *               config:
 *                 type: object
 *                 description: Configuration for the skill.
 *     responses:
 *       201:
 *         description: Skill created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Skill'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Skill already exists in this realm.
 *       500:
 *         description: Failed to create skill.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json();
  const { realmId, name, description, version, isRequired, config } = body;

  if (!realmId || typeof realmId !== "string") {
    return NextResponse.json({ error: "realmId is required" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const realms = await RealmDAO.findAll();
  if (!realms.find((r) => r.id === realmId)) {
    return NextResponse.json({ error: "Realm not found" }, { status: 404 });
  }

  try {
    const skill = await RealmSkillDAO.create({
      realmId,
      name: name.trim(),
      description: description?.trim() || undefined,
      version: version?.trim() || undefined,
      isRequired: isRequired === true,
      config: config && typeof config === "object" ? config : {},
      content:
        typeof body.content === "string" ? body.content || null : undefined,
    });
    broadcastSkillsConfig(realmId);
    return NextResponse.json(skill, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    if (msg.includes("UNIQUE") || code === "P2002") {
      return NextResponse.json(
        { error: `Skill "${name}" already exists in this realm` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create skill" },
      { status: 500 }
    );
  }
}
