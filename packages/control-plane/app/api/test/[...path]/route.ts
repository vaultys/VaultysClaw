/**
 * Test-only API — available only when ENABLE_TEST_API=true.
 *
 * Routes (catch-all under /api/test/…):
 *   GET  /api/test/registrations              — list pending registrations
 *   POST /api/test/registrations/:id/approve  — approve a pending registration
 *   GET  /api/test/agents                     — list connected agents
 *   GET  /api/test/agents/:id/workspace-llm       — workspace LiteLLM options for agent
 *   POST /api/test/agents/:id/llm-config      — set agent LLM config (PUT shortcut)
 *   POST /api/test/intent                     — send intent {agentId, action, params}
 *   GET  /api/test/results                    — recent intent_result activity entries
 *   POST /api/test/chat                       — send chat messages to agent (streaming SSE)
 *   GET  /api/test/models                     — list all model registry entries
 *   POST /api/test/models                     — create a model registry entry
 *   DELETE /api/test/models/:id               — delete a model registry entry
 *   POST /api/test/models/:id/workspaces          — grant model access to workspace
 *   GET  /api/test/workspaces                     — list all workspaces
 */

import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import {
  ActivityLogDAO,
  AgentDAO,
  ModelDAO,
  PendingRegistrationDAO,
  WorkspaceDAO,
} from "@/db";
import {
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
  registerModel,
  removeModel,
  createWorkspaceKey,
} from "@/lib/litellm-client";
import type { LlmConfig } from "@vaultysclaw/shared";
import { withError } from "@/lib/api/handlers/with-error";

const TEST_API_ENABLED = process.env.ENABLE_TEST_API === "true";

type RouteContext = { params: Promise<{ path: string[] }> };

function guard(): NextResponse | null {
  if (!TEST_API_ENABLED) {
    return NextResponse.json(
      { error: "Test API is disabled" },
      { status: 404 }
    );
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
export const GET = withError(async (_req: NextRequest, ctx: RouteContext) => {
  const g = guard();
  if (g) return g;

  const { path } = await ctx.params;
  const [resource, ...rest] = path;

  if (resource === "registrations") {
    return NextResponse.json(await PendingRegistrationDAO.findAll());
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

  // GET /api/test/agents/:id/workspace-llm
  if (resource === "agents" && rest[1] === "workspace-llm") {
    const agentDid = rest[0];
    const memberships = await AgentDAO.getWorkspaces(agentDid);
    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const routerKey = await WorkspaceDAO.getRouterKey(m.workspaceId);
        const models = (await ModelDAO.findByWorkspace(m.workspaceId))
          .filter(
            (model) => model.status === "active" && model.litellmModelName
          )
          .map((model) => ({
            id: model.id,
            name: model.name,
            provider: model.provider,
            modelId: model.modelId,
            litellmModelName: model.litellmModelName,
          }));
        return {
          workspaceId: m.workspaceId,
          workspaceName: m.workspace.name,
          isPrimary: Boolean(m.isPrimary),
          hasVirtualKey: Boolean(routerKey?.litellmVirtualKey),
          models,
        };
      })
    );
    return NextResponse.json({
      litellmConfigured: isLiteLLMConfigured(),
      litellmBaseUrl: getLiteLLMBaseUrl(),
      workspaces,
    });
  }

  // GET /api/test/models — list all model registry entries
  if (resource === "models" && rest.length === 0) {
    const entries = await ModelDAO.findAll();
    return NextResponse.json({
      models: entries.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        modelId: m.modelId,
        baseUrl: m.baseUrl,
        status: m.status,
        litellmModelName: m.litellmModelName,
      })),
    });
  }

  // GET /api/test/workspaces — list all workspaces
  if (resource === "workspaces") {
    const workspaces = await WorkspaceDAO.findAll();
    return NextResponse.json({
      workspaces: workspaces.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        isDefault: Boolean(r.isDefault),
      })),
    });
  }

  if (resource === "results") {
    const rows = await ActivityLogDAO.findByEvent("intent_result", 50);
    return NextResponse.json(
      rows.map((r) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = r.details ? JSON.parse(r.details) : {};
        } catch {}
        return {
          agentDid: r.agentDid,
          agentName: r.agentName,
          ...parsed,
          receivedAt: r.createdAt,
        };
      })
    );
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
});

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
export const POST = withError(async (req: NextRequest, ctx: RouteContext) => {
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
      return NextResponse.json(
        { error: "WS server not initialised" },
        { status: 503 }
      );
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

  // POST /api/test/agents/:id/llm-config — set agent LLM config (workspace routing shortcut)
  if (resource === "agents" && rest[1] === "llm-config") {
    const agentDid = rest[0];
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      typeof body.workspaceId === "string" &&
      typeof body.workspaceModelId === "string"
    ) {
      const routerKey = await WorkspaceDAO.getRouterKey(body.workspaceId);
      if (!routerKey?.litellmVirtualKey) {
        return NextResponse.json(
          { error: "Workspace has no LiteLLM virtual key configured" },
          { status: 400 }
        );
      }
      const workspaceModels = await ModelDAO.findByWorkspace(body.workspaceId);
      const model = workspaceModels.find((m) => m.id === body.workspaceModelId);
      if (!model?.litellmModelName) {
        return NextResponse.json(
          { error: "Model not found in workspace" },
          { status: 404 }
        );
      }
      const config: LlmConfig = {
        provider: "openai-compatible",
        baseUrl: getLiteLLMBaseUrl(),
        apiKey: routerKey.litellmVirtualKey,
        model: model.litellmModelName,
      };
      await AgentDAO.setLlmConfig(agentDid, config);
      const wsServer = getWSServer();
      const pushed = wsServer?.sendLlmConfig(agentDid, config) ?? false;
      const { apiKey: _k, ...rest_ } = config;
      return NextResponse.json({
        ok: true,
        pushed,
        config: { ...rest_, apiKeySet: true },
      });
    }
    return NextResponse.json(
      { error: "workspaceId and workspaceModelId required" },
      { status: 400 }
    );
  }

  // POST /api/test/models — create a model
  if (resource === "models" && rest.length === 0) {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!body.name || !body.provider || !body.modelId || !body.baseUrl) {
      return NextResponse.json(
        { error: "name, provider, modelId, baseUrl required" },
        { status: 400 }
      );
    }
    const slug = (body.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const litellmModelName = `${body.provider}/${slug}`;
    const entry = await ModelDAO.create({
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
    return NextResponse.json(
      { model: { id: entry.id, name: entry.name } },
      { status: 201 }
    );
  }

  // POST /api/test/models/:id/workspaces — grant workspace access
  if (resource === "models" && rest[1] === "workspaces") {
    const modelId = rest[0];
    const body = (await req.json().catch(() => ({}))) as { workspaceId?: string };
    if (!body.workspaceId)
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    const entry = await ModelDAO.findById(modelId);
    if (!entry)
      return NextResponse.json({ error: "Model not found" }, { status: 404 });

    await ModelDAO.grantWorkspaceAccess(modelId, body.workspaceId);

    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await WorkspaceDAO.getRouterKey(body.workspaceId);
        const currentModels: string[] = existing
          ? (existing.allowedModelIds as string[])
          : [];
        if (!currentModels.includes(entry.litellmModelName)) {
          const updated = [...currentModels, entry.litellmModelName];
          const { virtualKey } = await createWorkspaceKey(
            body.workspaceId,
            updated,
            existing?.monthlyBudgetUsd ?? undefined
          );
          await WorkspaceDAO.upsertRouterKey(body.workspaceId, {
            litellmVirtualKey: virtualKey,
            allowedModelIds: updated,
          });
        }
      } catch (e) {
        console.warn(
          "[test-api] LiteLLM workspace key update failed (non-fatal):",
          e
        );
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
    } = body as {
      agentId?: string;
      action?: string;
      params?: Record<string, unknown>;
    };

    if (!agentId || !intentAction) {
      return NextResponse.json(
        { error: "agentId and action are required" },
        { status: 400 }
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WS server not initialised" },
        { status: 503 }
      );
    }

    const intentId = `test-intent-${Date.now()}`;
    const ok = wsServer.sendIntentToAgent(
      agentId,
      intentId,
      intentAction,
      params ?? {}
    );
    if (!ok) {
      return NextResponse.json(
        { error: "Agent not connected" },
        { status: 404 }
      );
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
        { status: 400 }
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WS server not initialised" },
        { status: 503 }
      );
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
          writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ error: payload.error })}\n\n`
            )
          );
          writer.write(encoder.encode("data: [DONE]\n\n"));
          writer.close().catch(() => {});
          return;
        }
        if (payload.chunk) {
          writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ text: payload.chunk })}\n\n`
            )
          );
        }
        if (payload.done) {
          writer.write(encoder.encode("data: [DONE]\n\n"));
          writer.close().catch(() => {});
        }
      }
    );

    if (!sent) {
      return NextResponse.json(
        { error: "Agent not connected" },
        { status: 404 }
      );
    }

    // Timeout safety
    const timeout = setTimeout(() => {
      writer.write(
        encoder.encode(`data: ${JSON.stringify({ error: "timeout" })}\n\n`)
      );
      writer.write(encoder.encode("data: [DONE]\n\n"));
      writer.close().catch(() => {});
    }, 30_000);
    writer.closed
      .then(() => clearTimeout(timeout))
      .catch(() => clearTimeout(timeout));

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }) as any;
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
});

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
export const DELETE = withError(
  async (_req: NextRequest, ctx: RouteContext) => {
    const g = guard();
    if (g) return g;

    const { path } = await ctx.params;
    const [resource, id] = path;

    // DELETE /api/test/models/:id
    if (resource === "models" && id) {
      const entry = await ModelDAO.findById(id);
      if (!entry)
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      if (isLiteLLMConfigured() && entry.litellmModelName) {
        try {
          await removeModel(entry.litellmModelName);
        } catch (e) {
          console.warn("[test-api] LiteLLM removeModel failed (non-fatal):", e);
        }
      }
      await ModelDAO.delete(id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
);
