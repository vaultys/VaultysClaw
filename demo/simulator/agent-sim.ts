/**
 * AgentSimulator — a single fake WebSocket agent that speaks the real
 * VaultysClaw protocol with genuine VaultysId cryptography.
 *
 * Protocol flow (mirrors AgentController in packages/agent-controller/src/agent.ts):
 *   connect → register → auth_challenge (multi-round) → auth_complete
 *   → heartbeat loop + intent handler
 */

import WebSocket from "ws";
import { Challenger, VaultysId } from "@vaultys/id";
import { EventEmitter } from "events";
import { AgentConfig } from "./config.js";
import { generateIntentResponse, maybeFailure, randomDelay } from "./intent-templates.js";

interface WSMessage {
  messageId: string;
  type: string;
  agentId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class AgentSimulator extends EventEmitter {
  private ws: WebSocket | null = null;
  private authChallenger: Challenger | null = null;
  private authSessionId: string | null = null;
  private agentDid = "";
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private startedAt = Date.now();

  // Accumulating fake token counters
  private totalPrompt = 0;
  private totalCompletion = 0;
  private dailyPrompt = 0;
  private dailyCompletion = 0;
  private dailyCost = 0;
  private lastDayReset = new Date().toDateString();

  constructor(
    private readonly vaultysId: VaultysId,
    public readonly config: AgentConfig,
    private readonly wsUrl: string
  ) {
    super();
    this.agentDid = vaultysId.toVersion(1).did;
  }

  get did(): string {
    return this.agentDid;
  }

  get name(): string {
    return this.config.name;
  }

  connect(): void {
    if (this.stopped) return;

    this.authChallenger = null;
    this.authSessionId = null;

    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.on("open", () => {
      this.log("connecting…");
    });

    ws.on("message", (raw) => {
      try {
        const msg: WSMessage = JSON.parse(raw.toString());
        this.handleMessage(msg).catch((err) => this.log(`handler error: ${err}`));
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("close", () => {
      this.stopHeartbeat();
      if (!this.stopped) {
        this.log("disconnected — reconnecting in 5s");
        this.reconnectTimer = setTimeout(() => this.connect(), 5_000);
      }
    });

    ws.on("error", () => {
      ws.terminate();
    });
  }

  stop(): void {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.terminate();
  }

  private send(partial: Omit<WSMessage, "messageId" | "timestamp"> & { messageId?: string }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: WSMessage = {
      messageId: partial.messageId ?? `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...partial,
    };
    this.ws.send(JSON.stringify(msg));
  }

  // ── Message dispatcher ──────────────────────────────────────────

  private async handleMessage(msg: WSMessage): Promise<void> {
    switch (msg.type) {
      case "auth_challenge":
        await this.handleAuthChallenge(msg);
        break;
      case "auth_complete":
        this.handleAuthComplete(msg);
        break;
      case "auth_failed":
        this.log("auth failed — reconnecting");
        this.ws?.close();
        break;
      case "registration_pending":
        this.handleRegistrationPending(msg);
        break;
      case "registration_approved":
        this.log("registration approved");
        break;
      case "registration_rejected":
        this.log(`registration rejected: ${msg.payload.reason}`);
        this.stop();
        break;
      case "intent":
        await this.handleIntent(msg);
        break;
      case "pong":
        break; // heartbeat acknowledged
      default:
        break;
    }
  }

  // ── Auth handshake ──────────────────────────────────────────────
  // Mirrors the exact logic in AgentController.handleAuthChallenge()

  private async handleAuthChallenge(msg: WSMessage): Promise<void> {
    const payload = msg.payload as { sessionId: string; data: string };
    const { sessionId, data } = payload;

    if (!this.authChallenger && !data && !this.authSessionId) {
      // Step 1: first contact → send register
      this.authSessionId = sessionId;
      this.send({
        type: "register",
        payload: { name: this.config.name, version: "0.0.1" },
      });
    } else if (!this.authChallenger && !data && this.authSessionId) {
      // Step 2: server acked register → start auth handshake
      this.authSessionId = sessionId;
      this.startAuthHandshake();
    } else if (this.authChallenger) {
      // Step 3+: continue multi-round challenge
      const serverCert = Buffer.from(data, "base64");
      await this.authChallenger.update(serverCert);
      const cert = this.authChallenger.getCertificate();
      this.send({
        type: "auth_challenge",
        payload: {
          sessionId: this.authSessionId,
          data: Buffer.from(cert).toString("base64"),
          name: this.config.name,
          capabilities: this.config.capabilities,
        },
      });
    }
  }

  private startAuthHandshake(): void {
    this.authChallenger = new Challenger(this.vaultysId.toVersion(1));
    this.authChallenger.createChallenge("p2p", "auth");
    const cert = this.authChallenger.getCertificate();
    this.send({
      type: "auth_challenge",
      payload: {
        sessionId: this.authSessionId,
        data: Buffer.from(cert).toString("base64"),
        name: this.config.name,
        capabilities: this.config.capabilities,
      },
    });
  }

  private handleAuthComplete(msg: WSMessage): void {
    const payload = msg.payload as { agentId?: string; did?: string };
    if (payload.agentId) this.agentDid = payload.agentId;
    this.authChallenger = null;
    this.authSessionId = null;
    this.log(`✓ online  [${this.config.model}]  ${this.agentDid.slice(0, 26)}…`);
    this.emit("online");
    this.startHeartbeat();
  }

  private handleRegistrationPending(msg: WSMessage): void {
    const payload = msg.payload as { registrationId: string };
    this.log(`⏳ pending approval (registration ${payload.registrationId})`);
    this.emit("registration_pending", payload.registrationId);
  }

  // ── Heartbeat ───────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Send an immediate heartbeat, then every 30 s
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    // Reset daily counters at UTC midnight
    const today = new Date().toDateString();
    if (today !== this.lastDayReset) {
      this.dailyPrompt = 0;
      this.dailyCompletion = 0;
      this.dailyCost = 0;
      this.lastDayReset = today;
    }

    // Simulate realistic token activity since last heartbeat
    const busy = Math.random() > 0.3; // 70% of heartbeats show activity
    if (busy) {
      const prompt = Math.floor(Math.random() * 3000) + 200;
      const completion = Math.floor(Math.random() * 800) + 50;
      this.dailyPrompt += prompt;
      this.dailyCompletion += completion;
      this.totalPrompt += prompt;
      this.totalCompletion += completion;
      this.dailyCost +=
        (prompt * this.config.inputPrice + completion * this.config.outputPrice) / 1_000_000;
    }

    this.send({
      type: "heartbeat",
      agentId: this.agentDid,
      payload: {
        uptime: (Date.now() - this.startedAt) / 1000,
        memory: { rss: 80_000_000 + Math.random() * 40_000_000, heapUsed: 50_000_000, heapTotal: 80_000_000, external: 2_000_000, arrayBuffers: 1_000_000 },
        activeLlm: { provider: this.config.provider, model: this.config.model },
        name: this.config.name,
        tokenUsage: {
          total: { promptTokens: this.totalPrompt, completionTokens: this.totalCompletion },
          sinceLastSync: { promptTokens: busy ? Math.floor(Math.random() * 3000) : 0, completionTokens: busy ? Math.floor(Math.random() * 800) : 0 },
          daily: { promptTokens: this.dailyPrompt, completionTokens: this.dailyCompletion },
          monthly: { promptTokens: this.totalPrompt, completionTokens: this.totalCompletion },
          dailyPriceSpent: this.dailyCost,
        },
      },
    });
  }

  // ── Intent handler ──────────────────────────────────────────────

  private async handleIntent(msg: WSMessage): Promise<void> {
    const payload = msg.payload as { id: string; action: string; params?: Record<string, unknown> };
    const { id: intentId, action } = payload;

    this.log(`⚡ intent: ${action}`);

    // Simulate thinking time
    await randomDelay(1500, 6000);

    // Check for simulated failure
    const failure = maybeFailure(action);

    // Simulate token usage for this task
    const prompt = Math.floor(Math.random() * 4000) + 500;
    const completion = Math.floor(Math.random() * 1500) + 100;
    this.dailyPrompt += prompt;
    this.dailyCompletion += completion;
    this.totalPrompt += prompt;
    this.totalCompletion += completion;
    this.dailyCost +=
      (prompt * this.config.inputPrice + completion * this.config.outputPrice) / 1_000_000;

    this.send({
      type: "result",
      agentId: this.agentDid,
      payload: {
        intentId,
        status: failure ? "failed" : "success",
        output: failure ? undefined : generateIntentResponse(action, this.config.name),
        error: failure?.error,
        executedAt: new Date().toISOString(),
      },
    });

    this.log(`${failure ? "✗" : "✓"} ${action} ${failure ? `(${failure.error.slice(0, 40)})` : ""}`);
  }

  // ── Helpers ────────────────────────────────────────────────────

  private log(msg: string): void {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`  [${time}] ${this.config.name.padEnd(32)} ${msg}`);
  }
}

/** Load or generate a VaultysId from a file path (base64 secret) */
export async function loadOrCreateIdentity(filePath: string): Promise<VaultysId> {
  const fs = await import("fs");
  const path = await import("path");

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(filePath)) {
    const secret = fs.readFileSync(filePath, "utf-8").trim();
    return VaultysId.fromSecret(secret, "base64").toVersion(1);
  }

  const vid = await VaultysId.generateMachine();
  fs.writeFileSync(filePath, vid.toVersion(1).getSecret("base64"), "utf-8");
  return vid.toVersion(1);
}
