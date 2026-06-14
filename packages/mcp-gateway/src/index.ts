#!/usr/bin/env node
/**
 * VaultysClaw MCP Gateway
 *
 * A proper VaultysClaw agent (VaultysId identity, WebSocket auth, policies
 * distributed by the control plane) that exposes peer agents as MCP tools.
 *
 * Environment variables:
 *   VC_CONTROL_PLANE_URL     HTTP URL of the control plane (default: http://localhost:3000)
 *   VC_CONTROL_PLANE_WS_URL  WebSocket URL (default: ws://localhost:8080)
 *   VC_VAULTYS_ID_PATH       Path to VaultysId file (default: ~/.vaultysclaw/mcp-gateway.id)
 *   VC_AGENT_NAME            Display name in dashboard (default: mcp-gateway)
 *   VC_PEERJS_CONTROL_PLANE_ID  PeerJS peer ID of the control plane — when set,
 *                               connects via WebRTC instead of WebSocket
 *   VC_PEERJS_SERVER_URL     Custom PeerJS signaling server URL (optional)
 *
 * Internal env var set on spawned `claude -p` subprocesses to prevent the
 * subprocess from starting another gateway connection back to the control plane:
 *   VC_GATEWAY_BYPASS=1
 */

// ── Bypass guard ─────────────────────────────────────────────────────────────
// When `claude -p` is spawned by this gateway, it will try to start this MCP
// server again. Detect that and exit immediately so it doesn't create a second
// agent connection to the control plane.
if (process.env.VC_GATEWAY_BYPASS === "1") process.exit(0);

// ── Stdout guard — must run before any library import ────────────────────────
// Pino uses sonic-boom which writes via fs.write(fd) and bypasses this guard,
// so all pino loggers in agent-runtime must be created with process.stderr as
// their destination. This guard is a second layer for any library that does go
// through process.stdout.write.
{
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = function (
    chunk: string | Uint8Array,
    encoding?: any,
    callback?: any
  ): boolean {
    const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    const t = s.trimStart();
    // Only let valid MCP JSON-RPC 2.0 messages through; redirect everything else to stderr
    if (t.startsWith("{") && t.includes('"jsonrpc"') && t.includes('"2.0"')) {
      return orig(chunk, encoding, callback);
    }
    return process.stderr.write(chunk, encoding, callback);
  };
}

import "./polyfill.js";
import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AgentPeerGrant, ChatMessageEntry } from "@vaultysclaw/shared";
import { BaseAgentRuntime } from "@vaultysclaw/agent-runtime";

// ── Logging (always stderr) ───────────────────────────────────────────────────

const log = (...args: unknown[]) =>
  process.stderr.write(`[vaultysclaw-mcp] ${args.join(" ")}\n`);

// ── Config ────────────────────────────────────────────────────────────────────

function buildAgentConfig() {
  const controlPlaneUrl =
    process.env.VC_CONTROL_PLANE_URL ?? "http://localhost:3000";

  let controlPlaneWsUrl = process.env.VC_CONTROL_PLANE_WS_URL;
  if (!controlPlaneWsUrl) {
    const url = new URL(controlPlaneUrl);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    controlPlaneWsUrl = `${proto}//${url.hostname}:8080`;
  }

  const vaultysIdPath =
    process.env.VC_VAULTYS_ID_PATH ??
    path.join(os.homedir(), ".vaultysclaw", "mcp-gateway.id");

  const idDir = path.dirname(vaultysIdPath);
  if (!fs.existsSync(idDir)) fs.mkdirSync(idDir, { recursive: true });

  const peerjsControlPlaneId = process.env.VC_PEERJS_CONTROL_PLANE_ID || undefined;
  const peerjsServerUrl = process.env.VC_PEERJS_SERVER_URL || undefined;

  return {
    name: process.env.VC_AGENT_NAME ?? "mcp-gateway",
    controlPlaneUrl,
    controlPlaneWsUrl,
    peerjsControlPlaneId,
    peerjsServerUrl,
    llmConfig: null,
    vaultysIdPath,
    requestedCapabilities: ["agent_communication"] as any[],
    workspaceRoot: process.cwd(),
  };
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

const RunIntentSchema = z.object({
  agent_did: z.string(),
  action: z.string(),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  timeout_ms: z.number().min(1000).max(120_000).optional().default(60_000),
});

const ChatSchema = z.object({
  agent_did: z.string(),
  message: z.string(),
});

// ── Persistent Claude session per conversation ────────────────────────────────
//
// One `claude -p --input-format stream-json` process stays alive per conversation.
// New user messages are written to its stdin as JSON lines; responses arrive on
// stdout as stream-json events.  Sessions are reaped after 30 min of inactivity.

const SESSION_TTL_MS = 30 * 60_000;

interface ClaudeSession {
  proc: ReturnType<typeof spawn>;
  lineBuf: string;
  processedCount: number;   // total messages from control plane seen so far
  lastActive: number;
  pending: {
    chunks: string[];
    resolve: (text: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null;
}

const sessions = new Map<string, ClaudeSession>();

function spawnSession(): ClaudeSession {
  const proc = spawn(
    "claude",
    [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, VC_GATEWAY_BYPASS: "1" },
    }
  );

  const session: ClaudeSession = {
    proc,
    lineBuf: "",
    processedCount: 0,
    lastActive: Date.now(),
    pending: null,
  };

  proc.stdout.on("data", (chunk: Buffer) => {
    session.lineBuf += chunk.toString();
    const lines = session.lineBuf.split("\n");
    session.lineBuf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !session.pending) continue;
      try {
        const ev = JSON.parse(trimmed);
        if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
          for (const block of ev.message.content) {
            if (block.type === "text" && block.text) session.pending.chunks.push(block.text);
          }
        }
        if (ev.type === "result") {
          const { resolve, timer, chunks } = session.pending;
          session.pending = null;
          clearTimeout(timer);
          resolve(chunks.join(""));
        }
      } catch { /* ignore non-JSON lines */ }
    }
  });

  proc.on("close", () => {
    if (session.pending) {
      clearTimeout(session.pending.timer);
      session.pending.reject(new Error("Claude session exited unexpectedly"));
      session.pending = null;
    }
  });

  return session;
}

function getSession(conversationId: string): ClaudeSession {
  // Reap stale sessions
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActive > SESSION_TTL_MS) {
      s.proc.stdin?.end();
      sessions.delete(id);
      log(`[INFO] Session ${id} reaped (idle)`);
    }
  }

  let session = sessions.get(conversationId);
  if (!session || session.proc.exitCode !== null) {
    session = spawnSession();
    sessions.set(conversationId, session);
    log(`[INFO] Session started for conversation ${conversationId}`);
  }
  return session;
}

function sendToSession(session: ClaudeSession, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (session.pending) {
      reject(new Error("Session busy — previous response not yet complete"));
      return;
    }
    const timer = setTimeout(() => {
      if (session.pending) {
        session.pending.reject(new Error("Claude response timed out after 2 minutes"));
        session.pending = null;
      }
    }, 120_000);
    session.pending = { chunks: [], resolve, reject, timer };
    session.lastActive = Date.now();
    session.proc.stdin!.write(JSON.stringify({ type: "user", message: text }) + "\n");
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log("Starting VaultysClaw MCP Gateway...");

  const server = new Server(
    { name: "vaultysclaw", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  let agent: any = null;
  let agentStatus: string = "initializing";

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vc_list_agents",
        description:
          "List VaultysClaw agents this gateway has peer grants to communicate with. " +
          "Use agent DIDs with vc_run_intent or vc_chat.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "vc_run_intent",
        description:
          "Send an action + params to a peer agent and wait for the result. " +
          "Governed by VaultysClaw policies (budget, capabilities, approvals).",
        inputSchema: {
          type: "object",
          required: ["agent_did", "action"],
          properties: {
            agent_did: { type: "string", description: "DID of the target agent" },
            action: { type: "string", description: "Capability/action to invoke" },
            params: { type: "object", description: "Key-value parameters" },
            timeout_ms: { type: "number", description: "Max wait in ms (default 60 000)" },
          },
        },
      },
      {
        name: "vc_chat",
        description:
          "Send a natural-language message to a peer agent and get its LLM response.",
        inputSchema: {
          type: "object",
          required: ["agent_did", "message"],
          properties: {
            agent_did: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;

    if (agentStatus !== "connected") {
      const hint =
        agentStatus === "pending_approval"
          ? "The mcp-gateway agent is waiting for admin approval. Approve it, then restart Claude."
          : `Gateway is ${agentStatus} — try again in a moment.`;
      return { content: [{ type: "text", text: hint }], isError: true };
    }

    try {
      if (name === "vc_list_agents") {
        const catalog: AgentPeerGrant[] = agent.getPeerCatalog();
        if (catalog.length === 0) {
          return {
            content: [{
              type: "text",
              text:
                `No peer agents configured.\nGateway DID: ${agent.getDid()}\n\n` +
                `Ask a VaultysClaw admin to create peer grants from this gateway to the agents you want to access.`,
            }],
          };
        }
        const lines = catalog.map((g: AgentPeerGrant) =>
          [
            `**${g.targetName}**`,
            `  DID: ${g.targetDid}`,
            `  Description: ${g.skillDescription}`,
            `  Capabilities: ${(g.capabilities as string[]).join(", ") || "(none)"}`,
          ].join("\n")
        );
        return {
          content: [{ type: "text", text: `${catalog.length} peer agent(s):\n\n${lines.join("\n\n")}` }],
        };
      }

      if (name === "vc_run_intent") {
        const args = RunIntentSchema.parse(rawArgs ?? {});
        const result = await Promise.race([
          agent.invokePeer(args.agent_did, args.action, args.params ?? {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${args.timeout_ms}ms`)), args.timeout_ms)
          ),
        ]);
        return {
          content: [{
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          }],
        };
      }

      if (name === "vc_chat") {
        const args = ChatSchema.parse(rawArgs ?? {});
        const result = await agent.invokePeer(args.agent_did, "text_generation", {
          prompt: args.message,
        });
        const text =
          typeof result === "string" ? result : (result as any)?.text ?? JSON.stringify(result, null, 2);
        return { content: [{ type: "text", text: text || "(empty response)" }] };
      }

      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server ready. Connecting to control plane...");

  const config = buildAgentConfig();
  log(`Identity: ${config.vaultysIdPath}`);
  if (config.peerjsControlPlaneId) {
    log(`Control plane: ${config.controlPlaneUrl} (WebRTC peer=${config.peerjsControlPlaneId})`);
  } else {
    log(`Control plane: ${config.controlPlaneUrl} / ${config.controlPlaneWsUrl} (WebSocket)`);
  }

  // ── Single handler — works regardless of transport (WebSocket or WebRTC) ──
  //
  // Both chat and intent ultimately spawn a headless `claude -p` session.

  async function handleViaClaudeCLI(messages: ChatMessageEntry[], id: string): Promise<string> {
    const session = getSession(id);
    // Only send messages the session hasn't seen yet; skip assistant turns
    // (Claude tracks those internally in the persistent process)
    const newMessages = messages.slice(session.processedCount).filter((m) => m.role === "user");
    session.processedCount = messages.length;

    if (newMessages.length === 0) return "(no new message)";

    log(`[INFO] Sending ${newMessages.length} new message(s) to session ${id}`);
    let last = "";
    for (const m of newMessages) last = await sendToSession(session, m.content);
    return last;
  }

  class McpGatewayAgent extends BaseAgentRuntime {
    async executeIntent(
      action: string,
      params: Record<string, unknown>,
      _callerDid?: string,
      intentId?: string
    ): Promise<unknown> {
      const prompt =
        typeof params.prompt === "string" ? params.prompt :
        typeof params.message === "string" ? params.message :
        typeof params.text === "string" ? params.text :
        `${action} ${JSON.stringify(params)}`;
      const messages: ChatMessageEntry[] = [{ role: "user", content: prompt }];
      return handleViaClaudeCLI(messages, intentId ?? `intent-${Date.now()}`);
    }

    async executeChat(
      messages: ChatMessageEntry[],
      conversationId: string,
      sendChunk: (chunk: string, done?: boolean) => void
    ): Promise<void> {
      const text = await handleViaClaudeCLI(messages, conversationId);
      sendChunk(text, true);
    }
  }

  agent = new McpGatewayAgent(config);

  agent.on("log", ({ level, message }: { level: string; message: string }) => {
    if (level !== "debug") log(`[${level.toUpperCase()}] ${message}`);
  });

  agent.on("status_changed", ({ status }: { status: string }) => {
    agentStatus = status;
    log(`Status → ${status}`);
    if (status === "pending_approval") {
      log("⚠  Waiting for admin approval in the VaultysClaw dashboard.");
      log(`   Approve the agent named "${config.name}", then restart Claude desktop.`);
    }
    if (status === "connected") {
      log(`Connected. DID: ${agent.getDid()}`);
    }
  });

  await agent.start();
}

main().catch((err) => {
  log("Fatal:", err);
  process.exit(1);
});
