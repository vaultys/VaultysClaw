import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, malformed, conflict } from "@/lib/api-utils";
import { RealmDAO, WorkflowDAO } from "@/db";

/**
 * GET /api/realms — list realms. Admins see all; members see only their realms.
 */
/**
 * @openapi
 * /api/realms:
 *   get:
 *     summary: List realms with counts of agents, users, and workflows.
 *     tags: [Realms]
 *     responses:
 *       200:
 *         description: A list of realms with associated counts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 realms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       description:
 *                         type: string
 *                       color:
 *                         type: string
 *                       agentCount:
 *                         type: integer
 *                       userCount:
 *                         type: integer
 *                       workflowCount:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to fetch realms.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const allRealms = await RealmDAO.findAll();
  const userRealmIds = auth.isGlobalAdmin
    ? null
    : new Set((await RealmDAO.getUserRealms(auth.did)).map((r) => r.realmId));

  const realmsWithCounts = await Promise.all(
    allRealms
      .filter((realm) => userRealmIds === null || userRealmIds.has(realm.id))
      .map(async (realm) => {
        const agents = await RealmDAO.getAgents(realm.id);
        const users = await RealmDAO.getUsers(realm.id);
        const workflows = await WorkflowDAO.list({ realmId: realm.id });
        return {
          ...realm,
          agentCount: agents.length,
          userCount: users.length,
          workflowCount: workflows.length,
        };
      })
  );
  return NextResponse.json({ realms: realmsWithCounts });
}

/**
 * POST /api/realms — create a new realm. Global admin only.
 * Body: { name, slug, description?, color? }
 */
/**
 * @openapi
 * /api/realms:
 *   post:
 *     summary: Create a new realm.
 *     tags: [Realms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the realm.
 *               slug:
 *                 type: string
 *                 description: The slug for the realm.
 *               description:
 *                 type: string
 *                 description: A brief description of the realm.
 *               color:
 *                 type: string
 *                 description: The color associated with the realm.
 *             required:
 *               - name
 *     responses:
 *       201:
 *         description: Realm created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 realm:
 *                   $ref: '#/components/schemas/Realm'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: A realm with this slug already exists.
 *       500:
 *         description: Failed to create realm.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    name?: string;
    slug?: string;
    description?: string;
    color?: string;
  };

  if (!body.name?.trim()) {
    return malformed("name is required");
  }

  const slug = (body.slug ?? body.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    return malformed("Invalid slug");
  }

  const existing = await RealmDAO.findBySlug(slug);
  if (existing) {
    return conflict("A realm with this slug already exists");
  }

  const realm = await RealmDAO.create({
    name: body.name.trim(),
    slug,
    description: body.description?.trim() || undefined,
    color: body.color ?? "#6366f1",
  });

  return NextResponse.json({ realm }, { status: 201 });
}
