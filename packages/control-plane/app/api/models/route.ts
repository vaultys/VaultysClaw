import { NextRequest, NextResponse } from "next/server";
import {
  getAllModelRegistryEntries,
  createModelRegistryEntry,
  getModelRealmAccess,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { registerModel, isLiteLLMConfigured } from "@/lib/litellm-client";

/** GET /api/models — list models. Admin only. */
/**
 * @openapi
 * /api/models:
 *   get:
 *     summary: List all model registry entries.
 *     tags: [Models]
 *     responses:
 *       200:
 *         description: A list of models.
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
 *                       baseUrl:
 *                         type: string
 *                       litellmModelName:
 *                         type: string
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       realmCount:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to fetch models.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const entries = getAllModelRegistryEntries();

    const models = entries.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: m.provider,
      modelId: m.model_id,
      baseUrl: m.base_url,
      litellmModelName: m.litellm_model_name,
      status: m.status,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      realmCount: getModelRealmAccess(m.id).length,
    }));

    return NextResponse.json({ models });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}

/** POST /api/models — register a new model. Admin only. */
/**
 * @openapi
 * /api/models:
 *   post:
 *     summary: Register a new model. Admin only.
 *     tags: [Models]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the model.
 *               description:
 *                 type: string
 *                 description: A brief description of the model.
 *               provider:
 *                 type: string
 *                 description: The provider of the model.
 *               modelId:
 *                 type: string
 *                 description: The unique identifier for the model.
 *               baseUrl:
 *                 type: string
 *                 description: The base URL for the model API.
 *               apiKey:
 *                 type: string
 *                 description: The API key for accessing the model.
 *     responses:
 *       201:
 *         description: Model successfully registered.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model:
 *                   $ref: '#/components/schemas/Model'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Internal server error.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      provider?: string;
      modelId?: string;
      baseUrl?: string;
      apiKey?: string;
    };

    if (!body.name?.trim())
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!body.provider?.trim())
      return NextResponse.json(
        { error: "provider is required" },
        { status: 400 }
      );
    if (!body.modelId?.trim())
      return NextResponse.json(
        { error: "modelId is required" },
        { status: 400 }
      );
    if (!body.baseUrl?.trim())
      return NextResponse.json(
        { error: "baseUrl is required" },
        { status: 400 }
      );

    const entry = createModelRegistryEntry({
      name: body.name.trim(),
      description: body.description?.trim(),
      provider: body.provider.trim(),
      modelId: body.modelId.trim(),
      baseUrl: body.baseUrl.trim(),
      apiKeyEnc: body.apiKey?.trim() || undefined,
      createdBy: auth.did,
    });

    // Register with LiteLLM if configured
    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try {
        await registerModel({
          modelName: entry.litellm_model_name,
          litellmModel: `openai/${entry.model_id}`,
          apiBase: entry.base_url,
          apiKey: body.apiKey?.trim() || undefined,
        });
      } catch (litellmErr) {
        console.warn("LiteLLM registration failed (non-fatal):", litellmErr);
      }
    }

    return NextResponse.json(
      {
        model: {
          id: entry.id,
          name: entry.name,
          description: entry.description,
          provider: entry.provider,
          modelId: entry.model_id,
          baseUrl: entry.base_url,
          litellmModelName: entry.litellm_model_name,
          status: entry.status,
          createdAt: entry.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to create model" },
      { status: 500 }
    );
  }
}
