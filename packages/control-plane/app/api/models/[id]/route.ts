import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { ModelDAO, RealmDAO } from "@/db";
import {
import { withError } from "@/lib/api/handlers/with-error";
  registerModel,
  removeModel,
  isLiteLLMConfigured,
} from "@/lib/litellm-client";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/models/[id] */
/**
 * @openapi
 * /api/models/{id}:
 *   get:
 *     summary: Retrieve a model by its ID.
 *     tags: [Models]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the model to retrieve.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model:
 *                   $ref: '#/components/schemas/Model'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch model.
 */
export const GET = withError(async (_req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await params;
  const entry = await ModelDAO.findById(id);
  if (!entry) return notFound("Model not found");

  const realmAccess = await ModelDAO.getRealmAccess(id);
  const allRealms = await RealmDAO.findAll();

  return NextResponse.json({
    model: {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      provider: entry.provider,
      modelId: entry.modelId,
      baseUrl: entry.baseUrl,
      hasApiKey: Boolean(entry.apiKeyEnc),
      litellmModelName: entry.litellmModelName,
      status: entry.status,
      metadata: (entry.metadata ?? {}) as Record<string, unknown>,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      realms: realmAccess.map((ra) => {
        const realm = allRealms.find((r) => r.id === ra.realmId);
        return {
          realmId: ra.realmId,
          realmName: realm?.name ?? ra.realmId,
          grantedAt: ra.grantedAt,
        };
      }),
    },
  });
});

/** PUT /api/models/[id] — update model. Admin only. */
/**
 * @openapi
 * /api/models/{id}:
 *   put:
 *     summary: Update a model entry. Admin only.
 *     tags: [Models]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the model to update
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
 *                 nullable: true
 *               provider:
 *                 type: string
 *               modelId:
 *                 type: string
 *               baseUrl:
 *                 type: string
 *               apiKey:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Model updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to update model
 */
export const PUT = withError(async (req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const entry = await ModelDAO.findById(id);
  if (!entry) return notFound("Model not found");

  const body = (await req.json()) as {
    name?: string;
    description?: string | null;
    provider?: string;
    modelId?: string;
    baseUrl?: string;
    apiKey?: string | null;
    status?: "active" | "inactive";
  };

  await ModelDAO.update(id, {
    name: body.name?.trim(),
    description:
      body.description !== undefined
        ? body.description?.trim() || null
        : undefined,
    provider: body.provider?.trim(),
    modelId: body.modelId?.trim(),
    baseUrl: body.baseUrl?.trim(),
    apiKeyEnc:
      body.apiKey !== undefined ? body.apiKey?.trim() || null : undefined,
    status: body.status,
  });

  // Sync with LiteLLM if base URL or model changed
  const updated = await ModelDAO.findById(id);
  if (
    updated &&
    isLiteLLMConfigured() &&
    updated.litellmModelName &&
    (body.baseUrl || body.modelId || body.apiKey !== undefined)
  ) {
    try {
      await registerModel({
        modelName: updated.litellmModelName,
        litellmModel: `openai/${updated.modelId}`,
        apiBase: updated.baseUrl,
        apiKey: updated.apiKeyEnc ?? undefined,
      });
    } catch (e) {
      console.warn("LiteLLM sync failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ ok: true });
});

/** DELETE /api/models/[id] — admin only. */
/**
 * @openapi
 * /api/models/{id}:
 *   delete:
 *     summary: Delete a model by ID. Admin only.
 *     tags: [Models]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the model to delete
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete model
 */
export const DELETE = withError(async (_req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const entry = await ModelDAO.findById(id);
  if (!entry) return notFound("Model not found");

  if (isLiteLLMConfigured() && entry.litellmModelName) {
    try {
      await removeModel(entry.litellmModelName);
    } catch (e) {
      console.warn("LiteLLM removal failed (non-fatal):", e);
    }
  }

  await ModelDAO.delete(id);
  return NextResponse.json({ ok: true });
});
