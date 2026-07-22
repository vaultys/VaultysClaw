/**
 * ProxySimulator — a single fake proxy connection that speaks the real
 * VaultysClaw protocol with genuine VaultysId cryptography.
 *
 * Mirrors AgentSimulator's handshake exactly, with one difference: the
 * register payload carries `kind: "proxy"` so the control plane routes it
 * through ProxyDAO instead of AgentDAO. Once connected it doesn't receive
 * "intent" messages (proxies don't execute them) — instead it periodically
 * reports simulated `proxy_activity_log` batches so the demo's
 * /admin/proxies logs tab has realistic, non-empty traffic to look at.
 */

import WebSocket from "ws";
import { Challenger, VaultysId } from "@vaultys/id";
import { EventEmitter } from "events";
import { ProxyConfig, demoPrincipalDid } from "./config.js";

interface WSMessage {
  messageId: string;
  type: string;
  agentId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class ProxySimulator extends EventEmitter {
  private ws: WebSocket | null = null;
  private authChallenger: Challenger | null = null;
  private authSessionId: string | null = null;
  private proxyDid = "";
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private startedAt = Date.now();

  constructor(
    private readonly vaultysId: VaultysId,
    public readonly config: ProxyConfig,
    private readonly wsUrl: string
  ) {
    super();
    this.proxyDid = vaultysId.toVersion(1).did;
  }

  get did(): string {
    return this.proxyDid;
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
      this.stopActivity();
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
    this.stopActivity();
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
      case "proxy_config":
        break; // config pushes are just logged via the server side for this demo
      case "pong":
        break;
      default:
        break;
    }
  }

  // ── Auth handshake — identical to AgentSimulator, register carries kind:"proxy" ──

  private async handleAuthChallenge(msg: WSMessage): Promise<void> {
    const payload = msg.payload as { sessionId: string; data: string };
    const { sessionId, data } = payload;

    if (!this.authChallenger && !data && !this.authSessionId) {
      this.authSessionId = sessionId;
      this.send({
        type: "register",
        payload: { name: this.config.name, version: "0.0.1", kind: "proxy" },
      });
    } else if (!this.authChallenger && !data && this.authSessionId) {
      this.authSessionId = sessionId;
      this.startAuthHandshake();
    } else if (this.authChallenger) {
      const serverCert = Buffer.from(data, "base64");
      await this.authChallenger.update(serverCert);
      const cert = this.authChallenger.getCertificate();
      this.send({
        type: "auth_challenge",
        payload: {
          sessionId: this.authSessionId,
          data: Buffer.from(cert).toString("base64"),
          name: this.config.name,
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
      },
    });
  }

  private handleAuthComplete(msg: WSMessage): void {
    const payload = msg.payload as { agentId?: string; did?: string };
    if (payload.agentId) this.proxyDid = payload.agentId;
    this.authChallenger = null;
    this.authSessionId = null;
    this.log(`✓ online  ${this.proxyDid.slice(0, 26)}…`);
    this.emit("online");
    this.startHeartbeat();
    this.startActivity();
  }

  private handleRegistrationPending(msg: WSMessage): void {
    const payload = msg.payload as { registrationId: string };
    this.log(`⏳ pending approval (registration ${payload.registrationId})`);
    this.emit("registration_pending", payload.registrationId);
  }

  // ── Heartbeat ───────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
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
    this.send({
      type: "heartbeat",
      agentId: this.proxyDid,
      payload: { uptime: (Date.now() - this.startedAt) / 1000 },
    });
  }

  // ── Simulated activity ───────────────────────────────────────────
  // Cycles through the proxy's configured rules, producing a realistic mix
  // of no_check/governed allows and denies (including an occasional
  // never-granted principal, to show the "unknown/pending principal" flow).

  private startActivity(): void {
    this.stopActivity();
    // Stagger the first burst so all simulated proxies don't fire in lockstep
    const initialDelay = 2_000 + Math.random() * 6_000;
    setTimeout(() => this.sendActivityBatch(), initialDelay);
    this.activityTimer = setInterval(() => this.sendActivityBatch(), 12_000);
  }

  private stopActivity(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private sendActivityBatch(): void {
    if (this.config.rules.length === 0) return;

    const entries = [];
    const burstSize = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < burstSize; i++) {
      entries.push(this.simulateOneRequest());
    }

    this.send({
      type: "proxy_activity_log",
      agentId: this.proxyDid,
      payload: { entries },
    });
  }

  private simulateOneRequest(): Record<string, unknown> {
    const rule = this.config.rules[Math.floor(Math.random() * this.config.rules.length)];
    const start = Date.now();
    const latencyMs = 15 + Math.floor(Math.random() * 300);

    if (rule.mode === "no_check") {
      return {
        method: rule.method,
        url: rule.urlPattern.replace("*", "check"),
        ruleId: undefined,
        mode: "no_check",
        verdict: "allow",
        timestamp: new Date(start).toISOString(),
        latencyMs,
      };
    }

    // governed — pick a granted principal most of the time, an
    // unrecognized/pending one occasionally to demo the discovery flow.
    const roll = Math.random();
    const granted = this.config.principals.find(
      (p) => p.status === "active" && (!rule.governanceRule || p.governanceRules.includes(rule.governanceRule!))
    );

    if (granted && roll < 0.7) {
      return {
        method: rule.method,
        url: rule.urlPattern.replace("*", "resource"),
        mode: "governed",
        verdict: "allow",
        principalDid: demoPrincipalDid(this.config.name, granted.externalId),
        externalId: granted.externalId,
        identitySource: "proxy_provisioned",
        timestamp: new Date(start).toISOString(),
        latencyMs,
      };
    }

    const pending = this.config.principals.find((p) => p.status !== "active");
    if (pending && roll < 0.9) {
      return {
        method: rule.method,
        url: rule.urlPattern.replace("*", "resource"),
        mode: "governed",
        verdict: "deny",
        reason: `Governance rule '${rule.governanceRule}' not granted`,
        principalDid: demoPrincipalDid(this.config.name, pending.externalId),
        externalId: pending.externalId,
        identitySource: "proxy_provisioned",
        timestamp: new Date(start).toISOString(),
        latencyMs,
      };
    }

    // A never-seen caller — demonstrates auto-discovery of a new principal.
    const externalId = `unknown-caller-${Math.floor(Math.random() * 1000)}`;
    return {
      method: rule.method,
      url: rule.urlPattern.replace("*", "resource"),
      mode: "governed",
      verdict: "deny",
      reason: "Unrecognized principal",
      principalDid: demoPrincipalDid(this.config.name, externalId),
      externalId,
      identitySource: "proxy_provisioned",
      timestamp: new Date(start).toISOString(),
      latencyMs,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────

  private log(msg: string): void {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`  [${time}] ${this.config.name.padEnd(32)} ${msg}`);
  }
}
