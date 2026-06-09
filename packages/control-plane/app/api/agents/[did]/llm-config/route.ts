/**
 * GET    /api/agents/[did]/llm-config  — Return stored LLM config (key masked). Admin-only.
 * PUT    /api/agents/[did]/llm-config  — Set/update LLM config and push to agent if online. Admin-only.
 * DELETE /api/agents/[did]/llm-config  — Clear LLM config (agent falls back to env vars). Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { getLiteLLMBaseUrl } from "@/lib/litellm-client";
import type { LlmConfig, LlmProviderType } from "@vaultysclaw/shared";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";
import { SafeLlmConfig } from "@/types";

const VALID_PROVIDERS: LlmProviderType[] = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "openai-compatible",
];

function validateConfig(
  body: unknown
): { config: LlmConfig; error?: never } | { error: string; config?: never } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!VALID_PROVIDERS.includes(b.provider as LlmProviderType)) {
    return { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` };
  }
  if (typeof b.model !== "string" || b.model.trim() === "") {
    return { error: "model must be a non-empty string" };
  }
  if (b.apiKey !== undefined && typeof b.apiKey !== "string") {
    return { error: "apiKey must be a string" };
  }
  if (b.baseUrl !== undefined && typeof b.baseUrl !== "string") {
    return { error: "baseUrl must be a string" };
  }
  if (b.systemPrompt !== undefined && typeof b.systemPrompt !== "string") {
    return { error: "systemPrompt must be a string" };
  }
  if (
    b.maxTokens !== undefined &&
    (typeof b.maxTokens !== "number" || b.maxTokens < 1)
  ) {
    return { error: "maxTokens must be a positive number" };
  }

  const config: LlmConfig = {
    provider: b.provider as LlmProviderType,
    model: (b.model as string).trim(),
    apiKey: b.apiKey ? (b.apiKey as string).trim() : undefined,
    baseUrl: b.baseUrl ? (b.baseUrl as string).trim() : undefined,
    systemPrompt: b.systemPrompt
      ? (b.systemPrompt as string).trim()
      : undefined,
    maxTokens: b.maxTokens as number | undefined,
  };

  return { config };
}

/** Strip the apiKey from the response — it is write-only */
function safeConfig(config: LlmConfig): SafeLlmConfig {
  const { apiKey, ...rest } = config;
  return { ...rest, apiKeySet: Boolean(apiKey) };
}

/**
 * @openapi
 * /api/agent/{did}/llm-config:
 *   get:
 *     summary: Retrieve stored LLM config with masked API key.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The agent's DID.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the LLM config.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 config:
 *                   type: object
 *                   properties:
 *                     provider:
 *                       type: string
 *                     model:
 *                       type: string
 *                     baseUrl:
 *                       type: string
 *                     systemPrompt:
 *                       type: string
 *                     maxTokens:
 *                       type: integer
 *                     apiKeySet:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = await AgentDAO.findByDid(did);
  if (!agent) {
    return notFound();
  }

  if (!agent.llmConfig) {
    return NextResponse.json({ config: null });
  }

  try {
    const config = agent.llmConfig as unknown as LlmConfig;
    return NextResponse.json({ config: safeConfig(config) });
  } catch {
    return NextResponse.json({ config: null });
  }
}

/**
 * @openapi
 * /api/agent/{did}/llm-config:
 *   put:
 *     summary: Set or update the LLM config for an agent.
 *     tags: [Agents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: ["openai", "anthropic", "google", "ollama", "openai-compatible"]
 *               model:
 *                 type: string
 *               apiKey:
 *                 type: string
 *               baseUrl:
 *                 type: string
 *               systemPrompt:
 *                 type: string
 *               maxTokens:
 *                 type: integer
 *                 minimum: 1
 *               realmId:
 *                 type: string
 *               realmModelId:
 *                 type: string
 *               registryModelId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully updated the LLM config.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pushed
 *                   type: boolean
 *                 config:
 *                   type: object
 *                   properties:
 *                     provider:
 *                       type: string
 *                     model:
 *                       type: string
 *                     baseUrl:
 *                       type: string
 *                     systemPrompt:
 *                       type: string
 *                     maxTokens:
 *                       type: integer
 *                     apiKeySet:
 *                       type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = await AgentDAO.findByDid(did);
  if (!agent) {
    return notFound();
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  // Realm routing shortcut — resolve virtual key + litellm model name server-side
  if (
    body &&
    typeof body.realmId === "string" &&
    typeof body.realmModelId === "string"
  ) {
    const routerKey = await RealmDAO.getRouterKey(body.realmId);
    if (!routerKey?.litellmVirtualKey) {
      return NextResponse.json(
        { error: "Realm has no LiteLLM virtual key configured" },
        { status: 400 }
      );
    }
    const realmModels = await ModelDAO.findByRealm(body.realmId);
    const model = realmModels.find((m) => m.id === body.realmModelId);
    if (!model?.litellmModelName) {
      return notFound(
        "Model not found in realm or not registered with LiteLLM"
      );
    }
    const config: LlmConfig = {
      provider: "openai-compatible",
      baseUrl: getLiteLLMBaseUrl(),
      apiKey: routerKey.litellmVirtualKey,
      model: model.litellmModelName,
    };
    await AgentDAO.setLlmConfig(did, config);
    const wsServer = getWSServer();
    const pushed = wsServer ? await wsServer.sendLlmConfig(did, config) : false;
    return NextResponse.json({ pushed, config: safeConfig(config) });
  }

  // Registry model shortcut — resolve full config server-side so the API key never touches the client
  if (body && typeof body.registryModelId === "string") {
    const entry = await ModelDAO.findById(body.registryModelId);
    if (!entry) {
      return notFound("Registry model not found");
    }
    const config: LlmConfig = {
      provider: VALID_PROVIDERS.includes(entry.provider as LlmProviderType)
        ? (entry.provider as LlmProviderType)
        : "openai-compatible",
      model: entry.modelId,
      baseUrl: entry.baseUrl,
      apiKey: entry.apiKeyEnc ?? undefined,
    };
    await AgentDAO.setLlmConfig(did, config);
    const wsServer = getWSServer();
    const pushed = wsServer ? await wsServer.sendLlmConfig(did, config) : false;
    return NextResponse.json({ pushed, config: safeConfig(config) });
  }

  const validation = validateConfig(body);
  if (validation.error || !validation.config) {
    return NextResponse.json(
      { error: validation.error ?? "Invalid config" },
      { status: 400 }
    );
  }

  const config: LlmConfig = { ...validation.config };

  // If the user omitted apiKey on an update but one was already stored, preserve it
  if (!config.apiKey) {
    try {
      const existing = agent.llmConfig
        ? (agent.llmConfig as unknown as LlmConfig)
        : null;
      if (existing?.apiKey) config.apiKey = existing.apiKey;
    } catch {
      // ignore
    }
  }

  await AgentDAO.setLlmConfig(did, config);

  // Push to agent if currently connected
  const wsServer = getWSServer();
  const pushed = wsServer ? await wsServer.sendLlmConfig(did, config) : false;

  return NextResponse.json({
    pushed,
    config: safeConfig(config),
  });
}

/**
 * @openapi
 * /api/agent/{did}/llm-config:
 *   delete:
 *     summary: Clear LLM config for the agent.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the agent.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: LLM config cleared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pushed:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = await AgentDAO.findByDid(did);
  if (!agent) {
    return notFound("Agent not found");
  }

  await AgentDAO.setLlmConfig(did, null);

  // Push a "clear" message to agent if connected
  const wsServer = getWSServer();
  const pushed = wsServer?.sendLlmConfig(did, null) ?? false;

  return NextResponse.json({ pushed });
}
