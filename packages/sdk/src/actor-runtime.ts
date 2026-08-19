/**
 * `ActorRuntime` — the connection lifecycle for a VaultysClaw Actor.
 *
 * Instantiated, not subclassed. The old `BaseAgentRuntime` was abstract because
 * the previous control plane pushed work in (`intent`, `chat_message`) and a
 * consumer had to implement handlers for it. The rebuilt control plane dispatches
 * no work at all: an Actor proves its identity, obtains a certificate, gates its
 * *own* behaviour on what it was granted, and reports what it did. There is
 * nothing left to make abstract.
 *
 * Behaviour is ported from the Go SDK's `vconn.ClientConn`, which has been
 * exercised against a real control plane; the non-obvious parts are commented
 * where they occur.
 */

import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { VaultysId } from "@vaultys/id";
import { resolvePermission, type CapabilityCertificateLite, type PermissionDecision, type RequestedAction } from "@vaultysclaw/trust";
import type { AgentCapability } from "@vaultysclaw/policy";

import { loadOrCreateIdentity } from "./identity.js";
import { Handshake, HandshakeError } from "./handshake.js";
import { loadCapabilityState, saveCapabilityState } from "./cap-state.js";
import {
  envelope,
  type ActorConfigPayload,
  type AuthChallengePayload,
  type AuthCompletePayload,
  type AuthFailedPayload,
  type CertChallengePayload,
  type CertFailedPayload,
  type CertIssuedPayload,
  type ErrorPayload,
  type ProtocolMessage,
  type ProtocolMessageType,
  type RegistrationPendingPayload,
} from "./protocol.js";

export interface ActorRuntimeConfig {
  /** Display name shown in the admin console. */
  name: string;
  /** Actor kind. Decides the capability allow-list an approval is filtered against. */
  kind: string;
  /** e.g. `ws://localhost:8081`. `http(s)://` is accepted and converted. */
  controlPlaneWsUrl: string;
  /** Where the VaultysId secret lives. Created on first run. */
  identityPath: string;
  /**
   * What to ask for. A **request**, not a declaration — an admin may approve a
   * smaller set, and your Actor must work correctly holding less.
   *
   * There is deliberately no default: an SDK that silently asked for a
   * capability the caller never named would be requesting authority on their
   * behalf.
   */
  requestedCapabilities?: AgentCapability[];
  /** Persist the granted certificate here so a restart resumes with it. */
  capabilityStatePath?: string;
  version?: string;
  heartbeatIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  /** Set false to drive `connectOnce()` yourself. Default true. */
  autoReconnect?: boolean;
  logger?: Pick<Console, "debug" | "info" | "warn" | "error">;
}

export type ActorStatus =
  | "idle"
  | "connecting"
  | "registering"
  | "pending_approval"
  | "connected"
  | "disconnected";

export interface ActorRuntimeEvents {
  status: (status: ActorStatus) => void;
  pending: (payload: RegistrationPendingPayload) => void;
  connected: (payload: AuthCompletePayload) => void;
  certificate: (payload: CertIssuedPayload) => void;
  config: (payload: ActorConfigPayload) => void;
  message: (message: ProtocolMessage) => void;
  error: (error: Error) => void;
}

const DEFAULTS = {
  heartbeatIntervalMs: 30_000,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
};

export class ActorRuntime extends EventEmitter {
  private readonly cfg: Required<Pick<ActorRuntimeConfig, "name" | "kind" | "controlPlaneWsUrl" | "identityPath">> & ActorRuntimeConfig;
  private readonly log: NonNullable<ActorRuntimeConfig["logger"]>;

  private vaultysId: VaultysId | null = null;
  private ws: WebSocket | null = null;

  private authHandshake: Handshake | null = null;
  private authSessionId: string | null = null;
  private certHandshake: Handshake | null = null;
  private certSessionId: string | null = null;

  private did: string | null = null;
  private capabilities: string[] = [];
  private certId: string | null = null;
  private certificate: string | null = null;
  private actorConfig: ActorConfigPayload | null = null;

  private status: ActorStatus = "idle";
  private requestedThisConnection = false;
  private heartbeat: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private stopped = false;

  constructor(config: ActorRuntimeConfig) {
    super();
    this.cfg = config as ActorRuntime["cfg"];
    this.log = config.logger ?? console;

    // Restoring before the first connection is what makes a restart resume with
    // its authority rather than sitting capability-less until an admin notices.
    const restored = loadCapabilityState(config.capabilityStatePath);
    if (restored) {
      this.certId = restored.certId;
      this.certificate = restored.certificate;
      this.capabilities = restored.capabilities;
    }
  }

  // ── public API ──────────────────────────────────────────────────────────

  /** Connect, and keep reconnecting until `stop()`. Resolves once the identity is loaded. */
  async start(): Promise<void> {
    this.vaultysId = await loadOrCreateIdentity(this.cfg.identityPath);
    this.stopped = false;
    void this.runLoop();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.setStatus("idle");
  }

  /** This Actor's DID. Null until the handshake completes at least once. */
  getDid(): string | null {
    return this.did ?? this.vaultysId?.toVersion(1).did ?? null;
  }

  getStatus(): ActorStatus {
    return this.status;
  }

  /** Capabilities actually granted — not what was requested. */
  getCapabilities(): readonly string[] {
    return this.capabilities;
  }

  /** The most recent `actor_config` push, if any. */
  getActorConfig(): ActorConfigPayload | null {
    return this.actorConfig;
  }

  /**
   * Whether a capability was granted.
   *
   * The coarse check. Use `resolvePermission` when the grant may be scoped to a
   * particular resource.
   */
  hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Resolve a specific action against the held certificate.
   *
   * Delegates to `@vaultysclaw/trust` — the same decision function the control
   * plane and the Go SDK use, held together by the shared conformance vectors.
   *
   * Two limits worth knowing: `resolvePermission` never consults
   * `resourceLimits`, so `allowedDomains` and token budgets remain the caller's
   * job; and `maxUses` cannot bite unless the caller tracks `usedCount` itself.
   */
  resolvePermission(action: RequestedAction, now: number = Date.now()): PermissionDecision {
    return resolvePermission(action, this.activeCerts(), now);
  }

  /** Send a kind-specific message over the authenticated connection. */
  send<P>(type: ProtocolMessageType, payload: P): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Cannot send ${type}: not connected`);
    }
    this.ws.send(JSON.stringify(envelope(type, payload)));
  }

  // ── connection lifecycle ────────────────────────────────────────────────

  private async runLoop(): Promise<void> {
    const autoReconnect = this.cfg.autoReconnect !== false;
    do {
      try {
        await this.connectOnce();
        this.reconnectAttempts = 0;
      } catch (err) {
        // A connection failure must never be fatal — the control plane being
        // down is an ordinary condition, not a crash.
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
      if (this.stopped || !autoReconnect) break;
      await this.backoff();
    } while (!this.stopped);
  }

  private backoff(): Promise<void> {
    const base = this.cfg.reconnectBaseDelayMs ?? DEFAULTS.reconnectBaseDelayMs;
    const max = this.cfg.reconnectMaxDelayMs ?? DEFAULTS.reconnectMaxDelayMs;
    const delay = Math.min(max, base * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.log.debug?.(`sdk: reconnecting in ${delay}ms`);
    return new Promise((r) => setTimeout(r, delay));
  }

  /** One connection attempt, resolving when the socket closes. */
  private connectOnce(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.setStatus("connecting");
      this.requestedThisConnection = false;
      this.authHandshake = null;
      this.authSessionId = null;
      this.certHandshake = null;
      this.certSessionId = null;

      const ws = new WebSocket(toWsUrl(this.cfg.controlPlaneWsUrl));
      this.ws = ws;

      ws.on("open", () => {
        // The control plane sends NOTHING on connect — it replies only once it
        // has something to react to. Waiting for a greeting here hangs forever.
        this.setStatus("registering");
        this.sendRaw("register", {
          name: this.cfg.name,
          version: this.cfg.version ?? "0.0.1",
          kind: this.cfg.kind,
        });
      });

      ws.on("message", (data) => {
        void this.handleMessage(data.toString()).catch((err) => {
          this.emit("error", err instanceof Error ? err : new Error(String(err)));
        });
      });

      ws.on("error", (err) => {
        this.clearHeartbeat();
        reject(err);
      });

      ws.on("close", () => {
        this.clearHeartbeat();
        if (this.status !== "idle") this.setStatus("disconnected");
        resolve();
      });
    });
  }

  // ── message handling ────────────────────────────────────────────────────

  private async handleMessage(raw: string): Promise<void> {
    let message: ProtocolMessage;
    try {
      message = JSON.parse(raw) as ProtocolMessage;
    } catch {
      throw new Error("Received malformed JSON from control plane");
    }
    this.emit("message", message);

    switch (message.type) {
      case "auth_challenge":
        await this.onAuthChallenge(message.payload as AuthChallengePayload);
        break;
      case "auth_complete":
        this.onAuthComplete(message.payload as AuthCompletePayload);
        break;
      case "auth_failed":
        throw new Error(`Authentication refused: ${(message.payload as AuthFailedPayload).reason}`);
      case "registration_pending":
        this.onRegistrationPending(message.payload as RegistrationPendingPayload);
        break;
      case "cert_challenge":
        await this.onCertChallenge(message.payload as CertChallengePayload);
        break;
      case "cert_issued":
        this.onCertIssued(message.payload as CertIssuedPayload);
        break;
      case "cert_failed":
        this.emit("error", new Error(`Certificate issuance failed: ${(message.payload as CertFailedPayload).reason}`));
        break;
      case "actor_config":
        this.actorConfig = message.payload as ActorConfigPayload;
        this.emit("config", this.actorConfig);
        break;
      case "pong":
        break;
      case "error":
        this.emit("error", new Error((message.payload as ErrorPayload).reason));
        break;
      default:
        this.log.debug?.(`sdk: ignoring unhandled message type ${message.type}`);
    }
  }

  private async onAuthChallenge(payload: AuthChallengePayload): Promise<void> {
    // The server's opening message carries an empty `data` and the session id
    // it wants us to use. That is our cue to initiate.
    if (!this.authHandshake) {
      this.authSessionId = payload.sessionId;
      this.authHandshake = new Handshake(this.vaultysId!);
      const first = this.authHandshake.start("auth");
      this.sendRaw("auth_challenge", { sessionId: payload.sessionId, data: first });
      return;
    }

    if (payload.sessionId !== this.authSessionId) {
      throw new HandshakeError("auth_challenge for an unknown session");
    }

    // Once our own challenger is COMPLETE the server may still echo one final
    // round back (it does exactly this right after `auth_complete` on the
    // known-Actor reconnect path). Feeding it to `update()` throws
    // "Can't update COMPLETE challenge", so the trailing echo is acknowledged
    // by ignoring it — we already have everything it carries.
    if (this.authHandshake.isComplete()) {
      this.log.debug?.("sdk: ignoring trailing auth_challenge — handshake already complete");
      return;
    }

    const next = await this.authHandshake.accept(payload.data);
    // An empty round means there is nothing further to send from this side —
    // echoing it back would look like a malformed round to the server.
    if (next) {
      this.sendRaw("auth_challenge", { sessionId: payload.sessionId, data: next });
    }
  }

  private onAuthComplete(payload: AuthCompletePayload): void {
    this.did = payload.did;
    this.setStatus("connected");
    this.startHeartbeat();
    this.emit("connected", payload);

    // NOTE: the auth handshake is deliberately NOT torn down here. On the
    // reconnect path the control plane sends `auth_complete` *before* the final
    // `auth_challenge` round, and that trailing round is what drives our own
    // challenger to COMPLETE — which `contactId()` requires.

    // A known Actor that reconnects and still holds nothing would otherwise
    // wait forever on an admin who has no idea anything is wanted.
    this.maybeRequestCapabilities();
  }

  private onRegistrationPending(payload: RegistrationPendingPayload): void {
    // Not terminal. `auth_complete` arrives later, out of band, once an admin
    // approves — possibly followed immediately by `cert_challenge`. Hold on.
    this.setStatus("pending_approval");
    this.emit("pending", payload);
    this.maybeRequestCapabilities();
  }

  private async onCertChallenge(payload: CertChallengePayload): Promise<void> {
    // Server-initiated with empty `data`, after an admin approves. We are the
    // initiator here too, on a *fresh* challenger with service "certificate" —
    // the control plane rejects any other service string outright.
    if (!this.certHandshake) {
      this.certSessionId = payload.sessionId;
      this.certHandshake = new Handshake(this.vaultysId!);
      const first = this.certHandshake.start("certificate");
      this.sendRaw("cert_challenge", { sessionId: payload.sessionId, data: first });
      return;
    }

    if (payload.sessionId !== this.certSessionId) {
      throw new HandshakeError("cert_challenge for an unknown session");
    }

    if (this.certHandshake.isComplete()) {
      this.log.debug?.("sdk: ignoring trailing cert_challenge — exchange already complete");
      return;
    }

    const next = await this.certHandshake.accept(payload.data);
    if (next) {
      this.sendRaw("cert_challenge", { sessionId: payload.sessionId, data: next });
    }
  }

  private onCertIssued(payload: CertIssuedPayload): void {
    this.certId = payload.certId;
    this.certificate = payload.certificate;
    // Read from the plain field, never from certificate metadata — see the note
    // on CertIssuedPayload for why the metadata path is unusable.
    this.capabilities = payload.capabilities ?? [];
    this.certHandshake = null;
    this.certSessionId = null;

    try {
      saveCapabilityState(this.cfg.capabilityStatePath, {
        certId: this.certId,
        certificate: this.certificate,
        capabilities: this.capabilities,
      });
    } catch (err) {
      // Failing to persist is worth surfacing but must not drop the grant we
      // are holding in memory right now.
      this.emit("error", new Error(`Could not persist capability state: ${String(err)}`));
    }

    this.emit("certificate", payload);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  /**
   * Ask for capabilities, at most once per connection, and never when something
   * is already granted.
   *
   * Called from both `registration_pending` (so an admin sees what is wanted
   * while deciding) and `auth_complete` (so a known Actor holding nothing is not
   * silently stuck).
   */
  private maybeRequestCapabilities(): void {
    const wanted = this.cfg.requestedCapabilities ?? [];
    if (this.requestedThisConnection || wanted.length === 0 || this.capabilities.length > 0) return;
    this.requestedThisConnection = true;
    this.sendRaw("capability_request", { requestedCapabilities: wanted });
    this.log.info?.(`sdk: requested capabilities — none granted yet: ${wanted.join(", ")}`);
  }

  /**
   * The held certificate, in the shape `resolvePermission` expects.
   *
   * `status` is asserted `"active"` rather than verified: a revocation is only
   * observable through a live or stapled status check, which this runtime does
   * not perform yet. Anything relying on prompt revocation must check status
   * separately.
   */
  private activeCerts(): CapabilityCertificateLite[] {
    if (!this.certId || this.capabilities.length === 0) return [];
    return [
      {
        id: this.certId,
        agentDid: this.getDid() ?? "",
        capabilities: this.capabilities as AgentCapability[],
        resourceLimits: null,
        scope: null,
        status: "active",
        issuedAt: 0,
        expiresAt: null,
      },
    ];
  }

  private sendRaw<P>(type: ProtocolMessageType, payload: P): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(envelope(type, payload)));
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    const interval = this.cfg.heartbeatIntervalMs ?? DEFAULTS.heartbeatIntervalMs;
    this.heartbeat = setInterval(() => this.sendRaw("heartbeat", {}), interval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private setStatus(status: ActorStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}

/** Accept http(s) or ws(s); the control plane's WS port is what matters. */
function toWsUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
  if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
  return url;
}

export declare interface ActorRuntime {
  on<E extends keyof ActorRuntimeEvents>(event: E, listener: ActorRuntimeEvents[E]): this;
  emit<E extends keyof ActorRuntimeEvents>(event: E, ...args: Parameters<ActorRuntimeEvents[E]>): boolean;
}
