import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { notFound, unauthorized } from "@/lib/api-utils";
import { ModelDAO, RealmDAO } from "@/db";
import { isLiteLLMConfigured } from "@/lib/litellm-client";

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
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await params;
  const realm = await RealmDAO.findById(id);
  if (!realm) return notFound("Realm not found");

  const models = (await ModelDAO.findByRealm(id)).map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    provider: m.provider,
    modelId: m.modelId,
    litellmModelName: m.litellmModelName,
    status: m.status,
  }));

  const routerKey = await RealmDAO.getRouterKey(id);

  return NextResponse.json({
    models,
    litellmConfigured: isLiteLLMConfigured(),
    routerKey: routerKey
      ? {
          hasVirtualKey: Boolean(routerKey.litellmVirtualKey),
          keyPrefix: routerKey.litellmVirtualKey?.slice(0, 10) ?? null,
          allowedModels: routerKey.allowedModelIds,
          monthlyBudgetUsd: routerKey.monthlyBudgetUsd,
          updatedAt: routerKey.updatedAt ?? null,
        }
      : null,
  });
}
