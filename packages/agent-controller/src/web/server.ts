/**
 * Web UI server — serves the React/Tailwind SPA and API endpoints.
 *
 * Public endpoints (no auth required):
 *   GET  /api/auth/connect           → start P2P session → { connectionString, sessionId, qrUrl, agentDid }
 *   GET  /api/auth/status/:sessionId → poll auth status
 *   GET  /api/auth/me                → { did } if session valid, 401 otherwise (used by React SPA)
 *
 * Protected API endpoints (require vc_session cookie):
 *   POST /api/auth/logout
 *   GET  /api/events                 → Server-Sent Events stream
 *   GET  /api/info                   → AgentInfo snapshot
 *   GET  /api/config/llm             → LLM config (apiKey masked)
 *   PUT  /api/config/llm             → update LLM config
 *   DELETE /api/config/llm           → clear LLM config
 *
 * Static / SPA:
 *   GET  *  → serve file from public/ or fallback to index.html
 *
 * Build the React app first:  pnpm build:web
 * Dev with HMR:  pnpm dev:web-client  (Vite proxies /api → port 3002)
 */

import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Agent } from "../agent";
import type { LlmConfig } from "@vaultysclaw/shared";
import { streamChat } from "../llm";
import { startP2PAuthSession, getSessionStatus, invalidateAuthSession } from "./auth";
import { upsertWebSession, getWebSessionByToken, deleteWebSession, deleteExpiredWebSessions } from "../db";

export interface WebServerOptions {
  port: number;
  agent: Agent;
}

// ---------------------------------------------------------------------------
// Web session store (SQLite-backed, survives restarts)
// ---------------------------------------------------------------------------

interface WebSession {
  did: string;
  createdAt: number;
}

const WEB_SESSION_TTL = 3000 * 60_000;
// Minimum time between sliding-TTL DB writes for the same token (debounce).
const SESSION_REFRESH_INTERVAL = 5 * 60_000;

// In-memory cache: token → { session, lastRefreshedAt }
// Avoids a DB round-trip on every authenticated request.
const sessionCache = new Map<string, { session: WebSession; lastRefreshedAt: number }>();

// Periodically clean up expired sessions from DB and in-memory cache
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessionCache) {
    if (now - entry.session.createdAt > WEB_SESSION_TTL) sessionCache.delete(token);
  }
  try { deleteExpiredWebSessions(WEB_SESSION_TTL); } catch { /* DB may not be initialized */ }
}, 5 * 60_000).unref();

function parseSessionCookie(req: http.IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const t = part.trim();
    if (t.startsWith("vc_session=")) return t.slice("vc_session=".length);
  }
  return null;
}

function getWebSession(req: http.IncomingMessage): WebSession | null {
  const token = parseSessionCookie(req);
  if (!token) return null;

  const now = Date.now();

  // Fast path: serve from in-memory cache
  const cached = sessionCache.get(token);
  if (cached) {
    if (now - cached.session.createdAt > WEB_SESSION_TTL) {
      sessionCache.delete(token);
      deleteWebSession(token);
      return null;
    }
    // Debounced sliding TTL — only write to DB if it has been a while
    if (now - cached.lastRefreshedAt > SESSION_REFRESH_INTERVAL) {
      cached.session.createdAt = now;
      cached.lastRefreshedAt = now;
      upsertWebSession(token, cached.session.did, now);
    }
    return cached.session;
  }

  // Slow path: cache miss — load from DB (e.g. after a restart)
  try {
    const row = getWebSessionByToken(token);
    if (!row || now - row.created_at > WEB_SESSION_TTL) {
      if (row) deleteWebSession(token);
      return null;
    }
    const session: WebSession = { did: row.did, createdAt: row.created_at };
    sessionCache.set(token, { session, lastRefreshedAt: now });
    return session;
  } catch {
    return null;
  }
}

function createWebSession(did: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  upsertWebSession(token, did, now);
  const session: WebSession = { did, createdAt: now };
  sessionCache.set(token, { session, lastRefreshedAt: now });
  return token;
}

function invalidateWebSession(token: string): void {
  sessionCache.delete(token);
  deleteWebSession(token);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SseClient = http.ServerResponse;

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

const VALID_PROVIDERS = new Set(["openai", "anthropic", "google", "ollama", "openai-compatible"]);

function validateLlmConfig(body: unknown): { valid: true; config: LlmConfig } | { valid: false; error: string } {
  if (typeof body !== "object" || body === null) return { valid: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (typeof b.provider !== "string" || !VALID_PROVIDERS.has(b.provider))
    return { valid: false, error: `provider must be one of: ${[...VALID_PROVIDERS].join(", ")}` };
  if (typeof b.model !== "string" || !b.model.trim())
    return { valid: false, error: "model is required" };
  return {
    valid: true,
    config: {
      provider: b.provider as LlmConfig["provider"],
      model: b.model,
      apiKey: typeof b.apiKey === "string" && b.apiKey ? b.apiKey : undefined,
      baseUrl: typeof b.baseUrl === "string" && b.baseUrl ? b.baseUrl : undefined,
      systemPrompt: typeof b.systemPrompt === "string" && b.systemPrompt ? b.systemPrompt : undefined,
      maxTokens: typeof b.maxTokens === "number" && b.maxTokens > 0 ? Math.floor(b.maxTokens) : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function startWebServer({ port, agent }: WebServerOptions): http.Server {
  const sseClients = new Set<SseClient>();
  const publicDir = path.join(__dirname, "public");

  function broadcast(event: string, data: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try { client.write(payload); } catch { sseClients.delete(client); }
    }
  }

  const agentEvents = ["status_changed", "log", "heartbeat", "intent_received", "intent_result", "config_updated", "task_update"];
  for (const ev of agentEvents) agent.on(ev, (data: unknown) => broadcast(ev, data));
  const infoTimer = setInterval(() => broadcast("info", agent.getInfo()), 5000);

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = urlObj.pathname;
    const method = req.method ?? "GET";

    // ---- Public auth endpoints ----

    if (pathname === "/api/auth/connect" && method === "GET") {
      const vid = agent.getVaultysId();
      if (!vid) return jsonResponse(res, 503, { error: "Agent identity not ready" });
      try {
        const result = await startP2PAuthSession(vid, agent.getPeerjsServer());
        const agentDid = agent.getDid();
        const qrUrl = `https://wallet.vaultys.net/#${result.connectionString}&protocol=p2p&service=auth&did=${encodeURIComponent(agentDid)}`;
        return jsonResponse(res, 200, { ...result, qrUrl, agentDid });
      } catch (err) {
        console.error("[web] Failed to start P2P session:", err);
        return jsonResponse(res, 500, { error: "Failed to start authentication session" });
      }
    }

    if (pathname.startsWith("/api/auth/status/") && method === "GET") {
      const sessionId = pathname.slice("/api/auth/status/".length);
      const authSession = getSessionStatus(sessionId);
      if (!authSession) return jsonResponse(res, 404, { error: "Session not found or expired" });
      if (authSession.status === "success" && authSession.did) {
        const token = createWebSession(authSession.did);
        invalidateAuthSession(sessionId);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `vc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${WEB_SESSION_TTL / 1000}`,
        });
        return res.end(JSON.stringify({ status: "success", did: authSession.did }));
      }
      return jsonResponse(res, 200, { status: authSession.status });
    }

    if (pathname === "/api/auth/me" && method === "GET") {
      const session = getWebSession(req);
      if (!session) return jsonResponse(res, 401, { error: "Unauthorized" });
      return jsonResponse(res, 200, { did: session.did });
    }

    // ---- Semi-public endpoints (needed for dashboard to function) ----

    if (pathname === "/api/events" && method === "GET") {
      const webSession = getWebSession(req);
      if (!webSession) {
        // Return a single SSE event telling the client to re-authenticate
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        res.write(`event: auth_required\ndata: {}\n\n`);
        return res.end();
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(": connected\n\n");
      res.write(`event: info\ndata: ${JSON.stringify(agent.getInfo())}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (pathname === "/api/info" && method === "GET") {
      return jsonResponse(res, 200, agent.getInfo());
    }

    // ---- Protected API endpoints ----

    if (pathname.startsWith("/api/")) {
      const webSession = getWebSession(req);
      if (!webSession) {
        return jsonResponse(res, 401, { error: "Unauthorized — please authenticate via the dashboard" });
      }

      if (pathname === "/api/auth/logout" && method === "POST") {
        const token = parseSessionCookie(req);
        if (token) invalidateWebSession(token);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": "vc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        });
        return res.end(JSON.stringify({ ok: true }));
      }

      if (pathname === "/api/config/llm") {
        if (method === "GET") return jsonResponse(res, 200, agent.getLlmConfigSafe() ?? { none: true });

        if (method === "PUT") {
          let body: unknown;
          try { body = JSON.parse(await readBody(req)); } catch {
            return jsonResponse(res, 400, { error: "Invalid JSON body" });
          }
          const result = validateLlmConfig(body);
          if (!result.valid) return jsonResponse(res, 400, { error: result.error });
          await agent.updateLlmConfig(result.config);
          return jsonResponse(res, 200, { ok: true, config: agent.getLlmConfigSafe() });
        }

        if (method === "DELETE") {
          await agent.updateLlmConfig(null);
          return jsonResponse(res, 200, { ok: true });
        }

        res.writeHead(405); return res.end();
      }

      // ---- Chat (streaming) ----

      if (pathname === "/api/chat" && method === "POST") {
        const llmConfig = agent.getActiveLlmConfig();
        if (!llmConfig) return jsonResponse(res, 503, { error: "LLM not configured" });

        let body: unknown;
        try { body = JSON.parse(await readBody(req)); } catch {
          return jsonResponse(res, 400, { error: "Invalid JSON body" });
        }
        const { messages } = body as { messages?: Array<{ role: string; content: string }> };
        if (!Array.isArray(messages) || messages.length === 0) {
          return jsonResponse(res, 400, { error: "messages array is required" });
        }
        // Validate message format
        for (const m of messages) {
          if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
            return jsonResponse(res, 400, { error: "Each message must have role (user|assistant) and content (string)" });
          }
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        try {
          const result = streamChat(llmConfig, messages as Array<{ role: "user" | "assistant"; content: string }>);
          for await (const chunk of result.textStream) {
            if (res.destroyed) break;
            res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          }
          res.write("data: [DONE]\n\n");
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
        }
        res.end();
        return;
      }

      // ---- Tools & Skills ----

      if (pathname === "/api/tools" && method === "GET") {
        return jsonResponse(res, 200, { tools: agent.getToolList() });
      }

      if (pathname === "/api/skills" && method === "GET") {
        return jsonResponse(res, 200, { skills: agent.getSkills() });
      }

      if (pathname === "/api/tool-log" && method === "GET") {
        return jsonResponse(res, 200, { entries: agent.getToolLog() });
      }

      // ---- Tasks ----

      if (pathname === "/api/tasks") {
        if (method === "GET") {
          return jsonResponse(res, 200, { tasks: agent.getRecentTasks() });
        }
        if (method === "POST") {
          let body: unknown;
          try { body = JSON.parse(await readBody(req)); } catch {
            return jsonResponse(res, 400, { error: "Invalid JSON body" });
          }
          const b = body as Record<string, unknown>;
          if (typeof b.action !== "string" || !b.action.trim()) {
            return jsonResponse(res, 400, { error: "action is required" });
          }
          const taskId = agent.enqueueTask(
            b.action as string,
            (typeof b.params === "object" && b.params !== null ? b.params : {}) as Record<string, unknown>,
            {
              priority: typeof b.priority === "number" ? b.priority : undefined,
              scheduledAt: typeof b.scheduledAt === "string" ? b.scheduledAt : undefined,
              maxRetries: typeof b.maxRetries === "number" ? b.maxRetries : undefined,
            },
          );
          if (!taskId) return jsonResponse(res, 503, { error: "Task queue not initialized" });
          return jsonResponse(res, 201, { ok: true, taskId });
        }
        res.writeHead(405); return res.end();
      }

      // ---- Schedules ----

      if (pathname === "/api/schedules" && method !== "DELETE") {
        if (method === "GET") {
          return jsonResponse(res, 200, { schedules: agent.getSchedules() });
        }
        if (method === "POST") {
          let body: unknown;
          try { body = JSON.parse(await readBody(req)); } catch {
            return jsonResponse(res, 400, { error: "Invalid JSON body" });
          }
          const b = body as Record<string, unknown>;
          if (typeof b.id !== "string" || typeof b.name !== "string" || typeof b.cron !== "string" || typeof b.action !== "string") {
            return jsonResponse(res, 400, { error: "id, name, cron, and action are required strings" });
          }
          try {
            agent.upsertSchedule({
              id: b.id,
              name: b.name,
              cron: b.cron,
              action: b.action,
              params: (typeof b.params === "object" && b.params !== null ? b.params : {}) as Record<string, unknown>,
              enabled: b.enabled !== false,
            });
            return jsonResponse(res, 200, { ok: true });
          } catch (err) {
            return jsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
          }
        }
        res.writeHead(405); return res.end();
      }

      if (pathname.startsWith("/api/schedules/") && method === "DELETE") {
        const scheduleId = pathname.slice("/api/schedules/".length);
        if (!scheduleId) return jsonResponse(res, 400, { error: "Schedule ID required" });
        agent.removeSchedule(decodeURIComponent(scheduleId));
        return jsonResponse(res, 200, { ok: true });
      }

      // ---- Memory ----

      if (pathname === "/api/memory" && method !== "DELETE") {
        if (method === "GET") {
          const q = urlObj.searchParams.get("q") || undefined;
          const limit = parseInt(urlObj.searchParams.get("limit") ?? "20", 10);
          return jsonResponse(res, 200, { memories: agent.getMemories(q, limit) });
        }
        if (method === "POST") {
          let body: unknown;
          try { body = JSON.parse(await readBody(req)); } catch {
            return jsonResponse(res, 400, { error: "Invalid JSON body" });
          }
          const b = body as Record<string, unknown>;
          if (typeof b.content !== "string" || !b.content.trim()) {
            return jsonResponse(res, 400, { error: "content is required" });
          }
          const validTypes = ["fact", "procedure", "preference", "conversation_summary"];
          const type = validTypes.includes(b.type as string) ? b.type as string : "fact";
          const id = agent.saveMemory({
            type: type as any,
            content: b.content,
            tags: Array.isArray(b.tags) ? b.tags : [],
            importance: typeof b.importance === "number" ? b.importance : 0.5,
          });
          return jsonResponse(res, 201, { ok: true, id });
        }
        res.writeHead(405); return res.end();
      }

      if (pathname.startsWith("/api/memory/") && method === "DELETE") {
        const memId = pathname.slice("/api/memory/".length);
        if (!memId) return jsonResponse(res, 400, { error: "Memory ID required" });
        agent.deleteMemory(decodeURIComponent(memId));
        return jsonResponse(res, 200, { ok: true });
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }

    // ---- SPA static file serving (no auth — React app handles auth state) ----

    if (method === "GET") {
      const filePath = path.join(publicDir, pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { "Content-Type": getMimeType(filePath) });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      // SPA fallback — serve index.html for all non-asset routes
      const indexHtml = path.join(publicDir, "index.html");
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(indexHtml).pipe(res);
        return;
      }
      res.writeHead(503, { "Content-Type": "text/plain" });
      return res.end("Web dashboard not built yet. Run: pnpm build:web");
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[web] Dashboard available at http://127.0.0.1:${port}`);
  });

  server.on("close", () => {
    clearInterval(infoTimer);
    for (const ev of agentEvents) agent.removeAllListeners(ev);
  });

  return server;
}
