/**
 * SensorSimulator — a single fake vaultysclaw-sensor device that speaks the
 * real control plane protocol with genuine VaultysId cryptography.
 *
 * Mirrors AgentSimulator (agent-sim.ts) but registers with kind: "sensor"
 * and, once connected, periodically reports a fixed set of AI workload
 * observations as sensor_telemetry instead of heartbeat/intent traffic —
 * mirroring the real Go sensor (vaultysclaw-sensor/internal/vconn/client.go
 * and internal/telemetry/event.go).
 */

import WebSocket from "ws";
import { Challenger, VaultysId } from "@vaultys/id";
import { EventEmitter } from "events";
import { SensorConfig } from "./config.js";

interface WSMessage {
  messageId: string;
  type: string;
  agentId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

/** Matches packages/shared/src/types.ts SensorTelemetryEvent — kept inline
 * here rather than imported since this simulator runs outside the
 * control-plane package's module resolution context (same convention as
 * the local WSMessage interface above). */
interface SensorTelemetryEvent {
  schemaVersion: number;
  type: "ai_workload_detected" | "ai_workload_updated" | "ai_workload_stopped" | "mcp_server_detected" | "local_model_runtime_detected" | "provider_detected";
  timestamp: string;
  device: { id: string; hostname: string; os: string };
  workload: {
    fingerprint: string;
    process: { name: string; pid: number; executable?: string; command?: string; user?: string };
    provider?: string;
    model?: string;
    aiConfidence: number;
    agentConfidence: number;
    reasons: string[];
    isMcp?: boolean;
    mcpServers?: string[];
    isLocalRuntime?: boolean;
  };
}

export class SensorSimulator extends EventEmitter {
  private ws: WebSocket | null = null;
  private authChallenger: Challenger | null = null;
  private authSessionId: string | null = null;
  private deviceDid = "";
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly vaultysId: VaultysId,
    public readonly config: SensorConfig,
    private readonly wsUrl: string
  ) {
    super();
    this.deviceDid = vaultysId.toVersion(1).did;
  }

  get did(): string {
    return this.deviceDid;
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
      this.stopTelemetry();
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
    this.stopTelemetry();
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
      default:
        break;
    }
  }

  // ── Auth handshake ──────────────────────────────────────────────
  // Mirrors AgentSimulator.handleAuthChallenge — the only protocol
  // difference is the register payload's kind: "sensor" (below), which
  // routes this connection to the control plane's sensor-registration
  // branch instead of the agent one.

  private async handleAuthChallenge(msg: WSMessage): Promise<void> {
    const payload = msg.payload as { sessionId: string; data: string };
    const { sessionId, data } = payload;

    if (!this.authChallenger && !data && !this.authSessionId) {
      // Step 1: first contact → send register with kind: "sensor"
      this.authSessionId = sessionId;
      this.send({
        type: "register",
        payload: { name: this.config.name, version: "0.0.1", kind: "sensor" },
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
        payload: { sessionId: this.authSessionId, data: Buffer.from(cert).toString("base64") },
      });
    }
  }

  private startAuthHandshake(): void {
    this.authChallenger = new Challenger(this.vaultysId.toVersion(1));
    this.authChallenger.createChallenge("p2p", "auth");
    const cert = this.authChallenger.getCertificate();
    this.send({
      type: "auth_challenge",
      payload: { sessionId: this.authSessionId, data: Buffer.from(cert).toString("base64") },
    });
  }

  private handleAuthComplete(msg: WSMessage): void {
    const payload = msg.payload as { agentId?: string; did?: string };
    if (payload.agentId) this.deviceDid = payload.agentId;
    this.authChallenger = null;
    this.authSessionId = null;
    this.log(`✓ online  [${this.config.os}]  ${this.deviceDid.slice(0, 26)}…`);
    this.emit("online");
    this.startTelemetry();
  }

  private handleRegistrationPending(msg: WSMessage): void {
    const payload = msg.payload as { registrationId: string };
    this.log(`⏳ pending approval (registration ${payload.registrationId})`);
    this.emit("registration_pending", payload.registrationId);
  }

  // ── Telemetry ───────────────────────────────────────────────────
  // The real sensor only emits events on a state change (reconcile diff);
  // for the demo we just re-announce the same fixed workload set on an
  // interval, which is enough to keep the device "online" with a fresh
  // lastSeen and is harmless to replay (upsert by deviceDid+fingerprint).

  private startTelemetry(): void {
    this.stopTelemetry();
    this.sendTelemetry();
    this.telemetryTimer = setInterval(() => this.sendTelemetry(), 45_000);
  }

  private stopTelemetry(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
  }

  private sendTelemetry(): void {
    const now = new Date().toISOString();
    const events: SensorTelemetryEvent[] = this.config.workloads.map((w) => ({
      schemaVersion: 1,
      type: "ai_workload_detected",
      timestamp: now,
      device: { id: this.deviceDid, hostname: this.config.hostname, os: this.config.os },
      workload: {
        fingerprint: w.fingerprint,
        process: {
          name: w.processName,
          pid: 1000 + Math.floor(Math.random() * 60_000),
          executable: w.executable,
          command: w.command,
        },
        provider: w.provider,
        model: w.model,
        aiConfidence: w.aiConfidence,
        agentConfidence: w.agentConfidence,
        reasons: w.reasons,
        isMcp: w.isMcp,
        mcpServers: w.mcpServers,
        isLocalRuntime: w.isLocalRuntime,
      },
    }));

    // agentId is required — the control plane's handleSensorTelemetry
    // looks up the connected sensor by this top-level field and silently
    // drops the message without it.
    this.send({
      type: "sensor_telemetry",
      agentId: this.deviceDid,
      payload: { events },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────

  private log(msg: string): void {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`  [${time}] ${this.config.name.padEnd(32)} ${msg}`);
  }
}

/** Load or generate a VaultysId from a file path (base64 secret) — identical
 * to agent-sim.ts's helper of the same name, duplicated here to keep each
 * simulator module self-contained. */
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
