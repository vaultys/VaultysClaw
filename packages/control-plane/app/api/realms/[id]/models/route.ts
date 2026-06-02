import { NextRequest, NextResponse } from "next/server";
import { getRealmById, getModelsByRealm, getRealmRouterKey } from "@/lib/db";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/realms/[id]/models — list models available to a realm + router key info */
/**
 * @openapi
 * /api/realms/{id}/models:
 *   get:
 *     summary: List models available to a realm along with router key info.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the realm.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of models and router key information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       modelId:
 *                         type: string
 *                       litellmModelName:
 *                         type: string
 *                       status:
 *                         type: string
 *                 routerKey:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     hasVirtualKey:
 *                       type: boolean
 *                     allowedModels:
 *                       type: array
 *                       items:
 *                         type: string
 *                     monthlyBudgetUsd:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch realm models.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id } = await params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const models = getModelsByRealm(id).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: m.provider,
      modelId: m.model_id,
      litellmModelName: m.litellm_model_name,
      status: m.status,
    }));

    const routerKey = getRealmRouterKey(id);

    return NextResponse.json({
      models,
      routerKey: routerKey
        ? {
            hasVirtualKey: Boolean(routerKey.litellm_virtual_key),
            allowedModels: JSON.parse(routerKey.allowed_model_ids),
            monthlyBudgetUsd: routerKey.monthly_budget_usd,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch realm models" }, { status: 500 });
  }
}
