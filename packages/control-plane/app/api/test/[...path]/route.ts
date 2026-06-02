/**
 * Test-only API — available only when ENABLE_TEST_API=true.
 *
 * Routes (catch-all under /api/test/…):
 *   GET  /api/test/registrations              — list pending registrations
 *   POST /api/test/registrations/:id/approve  — approve a pending registration
 *   GET  /api/test/agents                     — list connected agents
 *   GET  /api/test/agents/:id/realm-llm       — realm LiteLLM options for agent
 *   POST /api/test/agents/:id/llm-config      — set agent LLM config (PUT shortcut)
 *   POST /api/test/intent                     — send intent {agentId, action, params}
 *   GET  /api/test/results                    — recent intent_result activity entries
 *   POST /api/test/chat                       — send chat messages to agent (streaming SSE)
 *   GET  /api/test/models                     — list all model registry entries
 *   POST /api/test/models                     — create a model registry entry
 *   DELETE /api/test/models/:id               — delete a model registry entry
 *   POST /api/test/models/:id/realms          — grant model access to realm
 *   GET  /api/test/realms                     — list all realms
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAllPendingRegistrations,
  getActivityLogByEvent,
  getAllModelRegistryEntries,
  createModelRegistryEntry,
  deleteModelRegistryEntry,
  getModelRegistryEntry,
  grantModelRealmAccess,
  getRealmRouterKey,
  upsertRealmRouterKey,
  getAllRealms,
  getAgentRealms,
  getModelsByRealm,
  setAgentLlmConfig,
} from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";
import {
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
  registerModel,
  removeModel,
  createRealmKey,
} from "@/lib/litellm-client";
import type { LlmConfig } from "@vaultysclaw/shared";

const TEST_API_ENABLED = process.env.ENABLE_TEST_API === "true";

type RouteContext = { params: Promise<{ path: string[] }> };

function guard(): NextResponse | null {
  if (!TEST_API_ENABLED) {
    return NextResponse.json({ error: "Test API is disabled" }, { status: 404 });
  }
  return null;
}

// ─────────────────────────────────────────────
// GET handlers
// ─────────────────────────────────────────────

/**
 * @openapi
 * /api/test/{...path}:
 *   get:
 *     summary: Handle various GET requests for test resources.
 *     tags: [Test]
 *     parameters:
 *       - name: path
 *         in: path
 *         required: true
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         style: simple
 *         explode: false
 *         description: The resource path segments.
 *     responses:
 *       200:
 *         description: Successful response with requested data.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext
): Promise<NextResponse> {
  const g = guard();
  if (g) return g;

  const { path } = await ctx.params;
  const [resource, ...rest] = path;

  if (resource === "registrations") {
    return NextResponse.json(getAllPendingRegistrations());
  }

  if (resource === "agents" && rest.length === 0) {
    const wsServer = getWSServer();
    const agents = wsServer
      ? wsServer.getConnectedAgents().map((a) => ({
        id: a.id,
        name: a.name,
        capabilities: a.capabilities,
        connectedAt: a.connectedAt,
        lastHeartbeat: a.lastHeartbeat,
      }))
      : [];
    return NextResponse.json(agents);
  }

  // GET /api/test/agents/:id/realm-llm
  if (resource === "agents" && rest[1] === "realm-llm") {
    const agentDid = rest[0];
    const memberships = getAgentRealms(agentDid);
    const realms = memberships.map((m) => {
      const routerKey = getRealmRouterKey(m.realm_id);
      const models = getModelsByRealm(m.realm_id)
        .filter((model) => model.status === "active" && model.litellm_model_name)
        .map((model) => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          modelId: model.model_id,
          litellmModelName: model.litellm_model_name,
        }));
      return {
        realmId: m.realm_id,
        realmName: m.name,
        isPrimary: Boolean(m.is_primary),
        hasVirtualKey: Boolean(routerKey?.litellm_virtual_key),
        models,
      };
    });
    return NextResponse.json({
      litellmConfigured: isLiteLLMConfigured(),
      litellmBaseUrl: getLiteLLMBaseUrl(),
      realms,
    });
  }

  // GET /api/test/models — list all model registry entries
  if (resource === "models" && rest.length === 0) {
    const entries = getAllModelRegistryEntries();
    return NextResponse.json({
      models: entries.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        modelId: m.model_id,
        baseUrl: m.base_url,
        status: m.status,
        litellmModelName: m.litellm_model_name,
      })),
    });
  }

  // GET /api/test/realms — list all realms
  if (resource === "realms") {
    const realms = getAllRealms();
    return NextResponse.json({
      realms: realms.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        isDefault: Boolean(r.is_default),
      })),
    });
  }

  if (resource === "results") {
    const rows = getActivityLogByEvent("intent_result", 50);
    return NextResponse.json(
      rows.map((r) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = r.details ? JSON.parse(r.details) : {};
        } catch { }
        return {
          agentDid: r.agent_did,
          agentName: r.agent_name,
          ...parsed,
          receivedAt: r.created_at,
        };
      })
    );
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

// ─────────────────────────────────────────────
// POST handlers
// ─────────────────────────────────────────────

/**
 * @openapi
 * /api/test/{...path}:
 *   post:
 *     summary: Handle various POST operations for test API.
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: Successful operation
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       503:
 *         description: WS server not initialised
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext
): Promise<NextResponse> {
  const g = guard();
  if (g) return g;

  const { path } = await ctx.params;
  const [resource, ...rest] = path;
  const [id, action] = rest;

  if (resource === "registrations" && action === "approve") {
    const body = await req.json().catch(() => ({}));
    const capabilities: string[] = Array.isArray(body.capabilities)
      ? body.capabilities
      : ["test_capability"];

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json({ error: "WS server not initialised" }, { status: 503 });
    }

    const ok = wsServer.approveRegistration(id, capabilities as any);
    if (!ok) {
      return NextResponse.json(
        { error: "Registration not found or already processed" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, registrationId: id, capabilities });
  }

  // POST /api/test/agents/:id/llm-config — set agent LLM config (realm routing shortcut)
  if (resource === "agents" && rest[1] === "llm-config") {
    const agentDid = rest[0];
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.realmId === "string" && typeof body.realmModelId === "string") {
      const routerKey = getRealmRouterKey(body.realmId);
      if (!routerKey?.litellm_virtual_key) {
        return NextResponse.json({ error: "Realm has no LiteLLM virtual key configured" }, { status: 400 });
      }
      const realmModels = getModelsByRealm(body.realmId);
      const model = realmModels.find((m) => m.id === body.realmModelId);
      if (!model?.litellm_model_name) {
        return NextResponse.json({ error: "Model not found in realm" }, { status: 404 });
      }
      const config: LlmConfig = {
        provider: "openai-compatible",
        baseUrl: getLiteLLMBaseUrl(),
        apiKey: routerKey.litellm_virtual_key,
        model: model.litellm_model_name,
      };
      setAgentLlmConfig(agentDid, config);
      const wsServer = getWSServer();
      const pushed = wsServer?.sendLlmConfig(agentDid, config) ?? false;
      const { apiKey: _k, ...rest_ } = config;
      return NextResponse.json({ ok: true, pushed, config: { ...rest_, apiKeySet: true } });
    }
    return NextResponse.json({ error: "realmId and realmModelId required" }, { status: 400 });
  }

  // POST /api/test/models — create a model
  if (resource === "models" && rest.length === 0) {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!body.name || !body.provider || !body.modelId || !body.baseUrl) {
      return NextResponse.json({ error: "name, provider, modelId, baseUrl required" }, { status: 400 });
    }
    const slug = (body.name as string).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const litellmModelName = `${body.provider}/${slug}`;
    const entry = createModelRegistryEntry({
      name: body.name as string,
      description: (body.description as string | undefined) ?? undefined,
      provider: body.provider as string,
      modelId: body.modelId as string,
      baseUrl: body.baseUrl as string,
      createdBy: "test-api",
    });
    if (isLiteLLMConfigured()) {
      try {
        await registerModel({
          modelName: litellmModelName,
          litellmModel: `${body.provider}/${body.modelId}`,
          apiBase: body.baseUrl as string,
        });
      } catch (e) {
        console.warn("[test-api] LiteLLM registerModel failed (non-fatal):", e);
      }
    }
    return NextResponse.json({ model: { id: entry.id, name: entry.name } }, { status: 201 });
  }

  // POST /api/test/models/:id/realms — grant realm access
  if (resource === "models" && rest[1] === "realms") {
    const modelId = rest[0];
    const body = await req.json().catch(() => ({})) as { realmId?: string };
    if (!body.realmId) return NextResponse.json({ error: "realmId required" }, { status: 400 });
    const entry = getModelRegistryEntry(modelId);
    if (!entry) return NextResponse.json({ error: "Model not found" }, { status: 404 });

    grantModelRealmAccess(modelId, body.realmId);

    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try {
        const existing = getRealmRouterKey(body.realmId);
        const currentModels: string[] = existing ? JSON.parse(existing.allowed_model_ids) : [];
        if (!currentModels.includes(entry.litellm_model_name)) {
          const updated = [...currentModels, entry.litellm_model_name];
          const { virtualKey } = await createRealmKey(body.realmId, updated, existing?.monthly_budget_usd ?? undefined);
          upsertRealmRouterKey(body.realmId, { litellmVirtualKey: virtualKey, allowedModelIds: updated });
        }
      } catch (e) {
        console.warn("[test-api] LiteLLM realm key update failed (non-fatal):", e);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (resource === "intent") {
    const body = await req.json().catch(() => ({}));
    const {
      agentId,
      action: intentAction,
      params,
    } = body as { agentId?: string; action?: string; params?: Record<string, unknown> };

    if (!agentId || !intentAction) {
      return NextResponse.json({ error: "agentId and action are required" }, { status: 400 });
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json({ error: "WS server not initialised" }, { status: 503 });
    }

    const intentId = `test-intent-${Date.now()}`;
    const ok = wsServer.sendIntentToAgent(agentId, intentId, intentAction, params ?? {});
    if (!ok) {
      return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, intentId });
  }

  if (resource === "chat") {
    const body = await req.json().catch(() => ({}));
    const { agentId, messages } = body as {
      agentId?: string;
      messages?: Array<{ role: string; content: string }>;
    };

    if (!agentId || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "agentId and messages are required" },
        { status: 400 },
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json({ error: "WS server not initialised" }, { status: 503 });
    }

    const conversationId = `test-chat-${Date.now()}`;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const sent = wsServer.sendChatToAgent(
      agentId,
      conversationId,
      messages as any,
      (payload) => {
        if (payload.error) {
          writer.write(encoder.encode(`data: ${JSON.stringify({ error: payload.error })}\n\n`));
          writer.write(encoder.encode("data: [DONE]\n\n"));
          writer.close().catch(() => { });
          return;
        }
        if (payload.chunk) {
          writer.write(encoder.encode(`data: ${JSON.stringify({ text: payload.chunk })}\n\n`));
        }
        if (payload.done) {
          writer.write(encoder.encode("data: [DONE]\n\n"));
          writer.close().catch(() => { });
        }
      },
    );

    if (!sent) {
      return NextResponse.json({ error: "Agent not connected" }, { status: 404 });
    }

    // Timeout safety
    const timeout = setTimeout(() => {
      writer.write(encoder.encode(`data: ${JSON.stringify({ error: "timeout" })}\n\n`));
      writer.write(encoder.encode("data: [DONE]\n\n"));
      writer.close().catch(() => { });
    }, 30_000);
    writer.closed.then(() => clearTimeout(timeout)).catch(() => clearTimeout(timeout));

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }) as any;
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

// ─────────────────────────────────────────────
// DELETE handlers
// ─────────────────────────────────────────────

/**
 * @openapi
 * /api/test/models/{id}:
 *   delete:
 *     summary: Delete a model registry entry.
 *     tags: [Test]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the model to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model successfully deleted.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const g = guard();
  if (g) return g;

  const { path } = await ctx.params;
  const [resource, id] = path;

  // DELETE /api/test/models/:id
  if (resource === "models" && id) {
    const entry = getModelRegistryEntry(id);
    if (!entry) return NextResponse.json({ error: "Model not found" }, { status: 404 });
    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try { await removeModel(entry.litellm_model_name); } catch (e) {
        console.warn("[test-api] LiteLLM removeModel failed (non-fatal):", e);
      }
    }
    deleteModelRegistryEntry(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
