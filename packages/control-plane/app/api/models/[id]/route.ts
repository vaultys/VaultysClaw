import { NextRequest, NextResponse } from "next/server";
import {
  getModelRegistryEntry,
  updateModelRegistryEntry,
  deleteModelRegistryEntry,
  getModelRealmAccess,
  getAllRealms,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import {
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
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const realmAccess = getModelRealmAccess(id);
    const allRealms = getAllRealms();

    return NextResponse.json({
      model: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        provider: entry.provider,
        modelId: entry.model_id,
        baseUrl: entry.base_url,
        hasApiKey: Boolean(entry.api_key_enc),
        litellmModelName: entry.litellm_model_name,
        status: entry.status,
        metadata: JSON.parse(entry.metadata || "{}"),
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
        realms: realmAccess.map((ra) => {
          const realm = allRealms.find((r) => r.id === ra.realm_id);
          return {
            realmId: ra.realm_id,
            realmName: realm?.name ?? ra.realm_id,
            grantedAt: ra.granted_at,
          };
        }),
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch model" },
      { status: 500 }
    );
  }
}

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
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await req.json()) as {
      name?: string;
      description?: string | null;
      provider?: string;
      modelId?: string;
      baseUrl?: string;
      apiKey?: string | null;
      status?: "active" | "inactive";
    };

    updateModelRegistryEntry(id, {
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
    const updated = getModelRegistryEntry(id)!;
    if (
      isLiteLLMConfigured() &&
      updated.litellm_model_name &&
      (body.baseUrl || body.modelId || body.apiKey !== undefined)
    ) {
      try {
        await registerModel({
          modelName: updated.litellm_model_name,
          litellmModel: `openai/${updated.model_id}`,
          apiBase: updated.base_url,
          apiKey: updated.api_key_enc ?? undefined,
        });
      } catch (e) {
        console.warn("LiteLLM sync failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to update model" },
      { status: 500 }
    );
  }
}

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
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try {
        await removeModel(entry.litellm_model_name);
      } catch (e) {
        console.warn("LiteLLM removal failed (non-fatal):", e);
      }
    }

    deleteModelRegistryEntry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to delete model" },
      { status: 500 }
    );
  }
}
