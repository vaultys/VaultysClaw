import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound, conflict } from "@/lib/api-utils";
import { RealmDAO, WorkflowDAO } from "@/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/realms/[id] — realm detail. Requires auth and realm membership.
 */
/**
 * @openapi
 * /api/realms/{id}:
 *   get:
 *     summary: Retrieve details of a specific realm.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the realm to retrieve.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A JSON object containing realm details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 realm:
 *                   $ref: '#/components/schemas/Realm'
 *                 agents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Agent'
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 workflows:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Workflow'
 *                 tokenUsage:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     promptTokens:
 *                       type: integer
 *                     completionTokens:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch realm
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const realm = await RealmDAO.findById(id);
  if (!realm) return notFound("Realm not found");

  if (!(await auth.canAccessRealm(id))) return forbidden();

  const agentRows = await RealmDAO.getAgents(id);
  const userRows = await RealmDAO.getUsers(id);
  const tokenUsage = await RealmDAO.getTokenUsage(id);
  const workflows = (await WorkflowDAO.list({ realmId: id })).map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }));

  const agents = agentRows.map((ar) => ({
    agentDid: ar.agent.did,
    agentName: ar.agent.name,
    capabilities: JSON.stringify(ar.agent.capabilities ?? []),
    isPrimary: ar.isPrimary ? 1 : 0,
    joinedAt: ar.joinedAt.toISOString(),
  }));

  const users = userRows.map((ur) => ({
    userDid: ur.user.did ?? ur.user.id,
    name: ur.user.name,
    email: ur.user.email,
    isPrimary: ur.isPrimary ? 1 : 0,
    joinedAt: ur.joinedAt.toISOString(),
  }));

  return NextResponse.json({
    realm,
    agents,
    users,
    workflows,
    tokenUsage: tokenUsage
      ? {
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
        }
      : null,
  });
}

/**
 * PATCH /api/realms/[id] — update realm metadata or config. Global admin only.
 * Body: { name?, description?, color?, llmConfig?, defaultCapabilities? }
 */
/**
 * @openapi
 * /api/realms/{id}:
 *   patch:
 *     summary: Update realm metadata or config.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the realm to update.
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
 *               color:
 *                 type: string
 *               llmConfig:
 *                 type: object
 *                 nullable: true
 *               defaultCapabilities:
 *                 type: array
 *                 items:
 *                   type: string
 *               tokenBudgetDaily:
 *                 type: integer
 *                 nullable: true
 *               tokenBudgetMonthly:
 *                 type: integer
 *                 nullable: true
 *               allowedCapabilities:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Realm updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Realm'
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
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  const realm = await RealmDAO.findById(id);
  if (!realm) return notFound("Realm not found");

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    color?: string;
    llmConfig?: object | null;
    defaultCapabilities?: string[];
    tokenBudgetDaily?: number | null;
    tokenBudgetMonthly?: number | null;
    allowedCapabilities?: string[] | null;
  };

  const updates: Parameters<typeof RealmDAO.update>[1] = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description;
  if (body.color !== undefined) updates.color = body.color;
  if ("llmConfig" in body)
    updates.llmConfig = body.llmConfig !== null ? body.llmConfig : null;
  if (body.defaultCapabilities !== undefined)
    updates.defaultCapabilities = body.defaultCapabilities;
  if ("tokenBudgetDaily" in body)
    updates.tokenBudgetDaily = body.tokenBudgetDaily ?? null;
  if ("tokenBudgetMonthly" in body)
    updates.tokenBudgetMonthly = body.tokenBudgetMonthly ?? null;
  if ("allowedCapabilities" in body)
    updates.allowedCapabilities =
      body.allowedCapabilities !== null &&
      body.allowedCapabilities !== undefined
        ? body.allowedCapabilities
        : null;

  await RealmDAO.update(id, updates);

  return NextResponse.json({ realm: await RealmDAO.findById(id) });
}

/**
 * DELETE /api/realms/[id] — delete realm (not allowed for default realm). Global admin only.
 */
/**
 * @openapi
 * /api/realms/{id}:
 *   delete:
 *     summary: Delete a realm (not allowed for default realm).
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the realm to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Realm successfully deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete realm.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  const ok = await RealmDAO.delete(id);
  if (!ok) {
    return conflict("Cannot delete the default realm");
  }
  return NextResponse.json({ ok: true });
}
