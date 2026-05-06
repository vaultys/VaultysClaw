/**
 * Test-only API — available only when ENABLE_TEST_API=true.
 *
 * Routes (catch-all under /api/test/…):
 *   GET  /api/test/registrations              — list pending registrations
 *   POST /api/test/registrations/:id/approve  — approve a pending registration
 *   GET  /api/test/agents                     — list connected agents
 *   POST /api/test/intent                     — send intent {agentId, action, params}
 *   GET  /api/test/results                    — recent intent_result activity entries
 *   POST /api/test/chat                       — send chat messages to agent (streaming SSE)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAllPendingRegistrations,
  getActivityLogByEvent,
} from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";

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

  if (resource === "agents") {
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

export async function POST(
  req: NextRequest,
  ctx: RouteContext
): Promise<NextResponse> {
  const g = guard();
  if (g) return g;

  const { path } = await ctx.params;
  // path[0] = resource, path[1] = id, path[2] = action (for registrations/:id/approve)
  const [resource, id, action] = path;

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
