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

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { VaultysId } from "@vaultys/id";
import { resolvePermission, type CapabilityCertificateLite, type PermissionDecision, type RequestedAction } from "@vaultysclaw/trust";
import {
  signCertStatusRequestCert,
  verifyCertStatusResponseCert,
  type AgentCapability,
  type CertificateStatus,
  type CertScope,
  type CertStatusResponseBody,
  type ResourceLimits,
} from "@vaultysclaw/policy";

import { loadOrCreateIdentity } from "./identity.js";
import { Handshake, HandshakeError } from "./handshake.js";
import { loadCapabilityState, saveCapabilityState } from "./cap-state.js";
import {
  EMPTY_MANIFEST,
  loadCapabilityManifest,
  type CapabilityManifest,
  type DeclaredCapability,
} from "./capability-manifest.js";
import {
  envelope,
  type ActorConfigPayload,
  type AuthChallengePayload,
  type AuthCompletePayload,
  type AuthFailedPayload,
  type CertChallengePayload,
  type CertFailedPayload,
  type CertIssuedPayload,
  type CapabilitiesChangedPayload,
  type CapabilityRegistryChangedPayload,
  type ErrorPayload,
  type ProtocolMessage,
  type CertStatusResponsePayload,
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
  /**
   * Path to a `capabilities.json` declaring which capabilities this application needs and which of
   * its operations each one gates (docs/CUSTOM_CAPABILITIES.md). Loaded eagerly at construction —
   * a malformed manifest throws rather than degrading to "no capabilities", which would look
   * identical to an application that needs none.
   *
   * The declared set is reported to the control plane in `register`, so an admin can see what is
   * wanted. Declaring is not requesting: nothing is granted without an admin acting.
   */
  capabilityManifestPath?: string;
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
  capabilityChange: (payload: CapabilityChange) => void;
  /**
   * The granted set changed after a verified status refresh — including to `[]`.
   * A host that caches which operations it may perform must rebuild that cache
   * here; this is the event a revocation or a deleted custom capability arrives
   * on.
   */
  capabilities: (capabilities: readonly string[]) => void;
  config: (payload: ActorConfigPayload) => void;
  message: (message: ProtocolMessage) => void;
  error: (error: Error) => void;
}

export interface CapabilityChange {
  current: readonly string[];
  added: readonly string[];
  removed: readonly string[];
  reason:
    | "certificate_issued"
    | "certificate_revoked"
    | "capability_deleted"
    | "capability_created"
    | "capability_updated"
    | "status_refresh"
    | "admin_update";
  certIds?: readonly string[];
}

const DEFAULTS = {
  heartbeatIntervalMs: 30_000,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
  /** How long to wait for a `cert_status_response` before treating the check as failed. */
  statusTimeoutMs: 10_000,
  /**
   * Refresh interval used until the control plane has pushed an `actor_config`.
   *
   * Not "never": a client that connected before its config arrived would
   * otherwise hold an unverified certificate indefinitely, which is the exact
   * gap status checking exists to close.
   */
  fallbackStatusIntervalMs: 300_000,
};

interface HeldCertificate {
  certId: string;
  certificate: string;
  capabilities: string[];
  resourceLimits: ResourceLimits | null;
  scope: CertScope | null;
  status: CertificateStatus | null;
  lastCheckedAt: number | null;
  issuedAt: number;
  expiresAt: number | null;
}

export class ActorRuntime extends EventEmitter {
  private readonly cfg: Required<Pick<ActorRuntimeConfig, "name" | "kind" | "controlPlaneWsUrl" | "identityPath">> & ActorRuntimeConfig;
  private readonly log: NonNullable<ActorRuntimeConfig["logger"]>;
  private readonly manifest: CapabilityManifest;

  private vaultysId: VaultysId | null = null;
  private ws: WebSocket | null = null;

  private authHandshake: Handshake | null = null;
  private authSessionId: string | null = null;
  private certHandshake: Handshake | null = null;
  private certSessionId: string | null = null;

  private did: string | null = null;
  private capabilityNames: string[] = [];
  private certId: string | null = null;
  private certificate: string | null = null;
  private readonly certificates = new Map<string, HeldCertificate>();
  private actorConfig: ActorConfigPayload | null = null;

  private status: ActorStatus = "idle";
  private requestedThisConnection = false;
  private heartbeat: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private stopped = false;

  // ── certificate status (the staple loop) ──
  /** The control plane's identity, taken from the completed auth handshake — see `serverVid()`. */
  private serverVidCache: VaultysId | null = null;
  private lastStatus: CertificateStatus | null = null;
  private lastCheckedAt: number | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private nextCapabilityChangeReason: CapabilityChange["reason"] | null = null;
  /** In-flight status checks, keyed by the nonce we signed into the request. */
  private readonly pendingStatusChecks = new Map<
    string,
    { resolve: (body: CertStatusResponseBody) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(config: ActorRuntimeConfig) {
    super();
    this.cfg = config as ActorRuntime["cfg"];
    this.log = config.logger ?? console;
    this.manifest = config.capabilityManifestPath
      ? loadCapabilityManifest(config.capabilityManifestPath)
      : EMPTY_MANIFEST;

    // Restoring before the first connection is what makes a restart resume with
    // its authority rather than sitting capability-less until an admin notices.
    const restored = loadCapabilityState(config.capabilityStatePath);
    if (restored) {
      for (const cert of restored.certificates) {
        this.certificates.set(cert.certId, {
          certId: cert.certId,
          certificate: cert.certificate,
          capabilities: cert.capabilities,
          resourceLimits: (cert.resourceLimits as ResourceLimits | null | undefined) ?? null,
          scope: (cert.scope as CertScope | null | undefined) ?? null,
          // Restored, not assumed: a status recorded before the process died is
          // evidence about the past, and freshness decides whether it can still
          // back a decision.
          status: cert.lastStatus ?? null,
          lastCheckedAt: cert.lastCheckedAt ?? null,
          issuedAt: cert.issuedAt ?? 0,
          expiresAt: cert.expiresAt ?? null,
        });
      }
      this.syncCertificateSnapshot();
    }
  }

  // ── public API ──────────────────────────────────────────────────────────

  /** Connect, and keep reconnecting until `stop()`. Resolves once the identity is loaded. */
  async start(): Promise<void> {
    this.vaultysId = await loadOrCreateIdentity(this.cfg.identityPath);
    this.stopped = false;
    void this.runLoop();
  }

  /**
   * Drop the current connection without stopping the runtime, so the reconnect loop takes over.
   *
   * Distinct from {@link stop}: this is "the network went away", not "shut down". It exists because
   * the reconnect path is where re-delivery of an approved grant and re-verification of certificate
   * status happen — the parts most likely to be quietly broken, and impossible to exercise from
   * outside without either unplugging something or waiting for luck.
   */
  dropConnection(): void {
    this.ws?.close();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.clearStatusTimer();
    for (const [nonce, waiter] of this.pendingStatusChecks) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Runtime stopped"));
      this.pendingStatusChecks.delete(nonce);
    }
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

  /** Capabilities currently usable by this Actor — not merely what it requested. */
  capabilitiesSnapshot(): readonly string[] {
    return this.capabilityNames;
  }

  /** Alias for {@link capabilitiesSnapshot}. */
  capabilities(): readonly string[] {
    return this.capabilitiesSnapshot();
  }

  onCapabilityChange(listener: ActorRuntimeEvents["capabilityChange"]): this {
    return this.on("capabilityChange", listener);
  }

  /** Capabilities actually granted — not what was requested. */
  getCapabilities(): readonly string[] {
    return this.capabilitiesSnapshot();
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
    return this.capabilitiesSnapshot().includes(capability);
  }

  /**
   * Resolve a specific action against the held certificate, using the cached certificate status.
   *
   * Delegates to `@vaultysclaw/trust` — the same decision function the control
   * plane and the Go SDK use, held together by the shared conformance vectors.
   *
   * Synchronous, so it decides on what is already known. It denies when the certificate's last
   * verified status was not `active`, and — under `trust.failClosed` — when the staple has aged
   * past `trust.maxStatusAgeSeconds`. With `maxStatusAgeSeconds: 0` (no cached status is
   * acceptable) it therefore **always** denies; use {@link checkPermission} there.
   *
   * Three limits worth knowing: `resolvePermission` never consults `resourceLimits`, so
   * `allowedDomains` and token budgets remain the caller's job; `maxUses` cannot bite unless the
   * caller tracks `usedCount` itself; and a decision is only as current as the last refresh.
   */
  resolvePermission(action: RequestedAction, now: number = Date.now()): PermissionDecision {
    return resolvePermission(action, this.activeCerts(), now);
  }

  /**
   * Resolve an action, refreshing the certificate status first if the cached one is too old.
   *
   * The variant to use for anything consequential, and the **only** one that works under
   * `maxStatusAgeSeconds: 0`. When the refresh fails, the decision falls back to
   * {@link resolvePermission}, which denies under `failClosed` — an unreachable control plane
   * must not silently widen what this Actor may do.
   */
  async checkPermission(action: RequestedAction): Promise<PermissionDecision> {
    if (!this.allStatusesFresh()) {
      const checkedBefore = new Map(
        [...this.certificates.entries()].map(([certId, cert]) => [certId, cert.lastCheckedAt] as const)
      );
      const refreshed = await this.refreshCertStatus();
      if (refreshed) {
        // A just-verified response is current, so decide on it directly rather than going through
        // `activeCerts`, whose staleness gate rejects a 0-second bound immediately after the live
        // check that satisfied it.
        return resolvePermission(action, this.activeCerts({ checkedAfter: checkedBefore }), Date.now());
      }
    }
    return this.resolvePermission(action);
  }

  /** Main permission API: refresh if needed, then answer whether the action is allowed. */
  async can(capability: AgentCapability, resource?: string): Promise<boolean> {
    return (await this.checkPermission({ capability, resource })).allowed;
  }

  /** Synchronous cached check for UI hints and logs. Use {@link can} before doing real work. */
  allows(capability: AgentCapability, resource?: string): boolean {
    return this.resolvePermission({ capability, resource }).allowed;
  }

  /**
   * Which capability gates this operation, per the manifest, or `null` if nothing binds it.
   *
   * `null` means "unbound", which {@link isOperationAllowed} treats as denied — an operation the
   * manifest does not mention is one nobody decided was safe.
   */
  capabilityFor(operation: string): string | null {
    return this.manifest.bindings[operation] ?? null;
  }

  /** Everything the manifest declares — what `register` reports and an admin sees. */
  getDeclaredCapabilities(): readonly DeclaredCapability[] {
    return this.manifest.declares;
  }

  /**
   * Whether this Actor may currently perform a named operation.
   *
   * The predicate a host application should gate on, so it never has to reimplement the mapping or
   * the staleness rules. Resolves the manifest binding, then delegates to {@link checkPermission}
   * — which refreshes the certificate status when the cached one is too old, and denies when the
   * control plane cannot be reached under `failClosed`.
   *
   * There is deliberately **no** "nothing granted means allow everything" fallback. An unbound
   * operation, an ungranted capability and an unreachable control plane all deny.
   */
  async isOperationAllowed(operation: string, resource?: string): Promise<boolean> {
    const capability = this.capabilityFor(operation);
    if (!capability) {
      this.log.debug?.(`sdk: operation "${operation}" is not bound to any capability — denied`);
      return false;
    }
    const decision = await this.checkPermission({
      capability: capability as AgentCapability,
      resource,
    });
    return decision.allowed;
  }

  /**
   * Declared capabilities this Actor does **not** currently hold.
   *
   * What to log on startup so an operator can see why an operation is refusing, without having to
   * open the admin console to find out.
   */
  missingCapabilities(): DeclaredCapability[] {
    const held = new Set(this.capabilityNames);
    return this.manifest.declares.filter((d) => !held.has(d.name));
  }

  /** The certificate status last verified with the control plane, and when. */
  getCertStatus(): { status: CertificateStatus | null; checkedAt: number | null; fresh: boolean } {
    return { status: this.lastStatus, checkedAt: this.lastCheckedAt, fresh: this.isStatusFresh() };
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
      // Re-derived from the new handshake. Caching it across connections would keep trusting a key
      // that is no longer the one authenticating us.
      this.serverVidCache = null;

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
          // The full declared set, every connection. The control plane diffs it against its
          // registry and this Actor's grants so an admin can see what is wanted and, for a custom
          // name that does not exist yet, create it. Sending it does not request or grant
          // anything — `capability_request` is the ask, and an admin is still the only way
          // anything is issued.
          declaredCapabilities: this.manifest.declares.length > 0 ? this.manifest.declares : undefined,
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
      case "capabilities_changed":
        await this.onCapabilitiesChanged(message.payload as CapabilitiesChangedPayload);
        break;
      case "capability_registry_changed":
        this.onCapabilityRegistryChanged(message.payload as CapabilityRegistryChangedPayload);
        break;
      case "actor_config":
        this.actorConfig = message.payload as ActorConfigPayload;
        // The trust block is what drives the refresh cadence, so a pushed config has to re-arm the
        // timer — an admin tightening the staple TTL takes effect on the next push, not the next
        // restart.
        this.scheduleStatusChecks();
        this.emit("config", this.actorConfig);
        break;
      case "cert_status_response":
        this.onCertStatusResponse(message.payload as CertStatusResponsePayload);
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

    // Re-check a certificate we already hold as soon as we are able to. A grant can have been
    // revoked, or a custom capability deleted from the registry, while this Actor was offline —
    // the reconnect is the first moment that is observable. Deferred a tick because the server
    // identity only becomes available once the trailing `auth_challenge` round completes our own
    // challenger (see the note above).
    if (this.certificates.size > 0) {
      setTimeout(() => void this.refreshCertStatus(), 0);
    }
    this.scheduleStatusChecks();
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
    const before = this.capabilityNames;
    this.certificates.set(payload.certId, {
      certId: payload.certId,
      certificate: payload.certificate,
      // Read from the plain field, never from certificate metadata — see the note
      // on CertIssuedPayload for why the metadata path is unusable.
      capabilities: payload.capabilities ?? [],
      resourceLimits: null,
      scope: null,
      status: "active",
      lastCheckedAt: Date.now(),
      issuedAt: Date.now(),
      expiresAt: null,
    });
    this.syncCertificateSnapshot();
    this.certHandshake = null;
    this.certSessionId = null;

    // Failing to persist is worth surfacing but must not drop the grant we are
    // holding in memory right now — `persistCapabilityState` emits rather than throws.
    this.persistCapabilityState();

    this.emit("certificate", payload);
    if (this.capabilitySetChanged(before, this.capabilityNames)) {
      this.emit("capabilities", this.capabilityNames);
      this.emitCapabilityChange(before, "certificate_issued", [payload.certId]);
    }
    this.scheduleStatusChecks();
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
  private maybeRequestCapabilities(options: { force?: boolean } = {}): void {
    const wanted = this.cfg.requestedCapabilities ?? [];
    const held = new Set(this.capabilityNames);
    const missing = wanted.filter((capability) => !held.has(capability));
    if ((!options.force && this.requestedThisConnection) || missing.length === 0) return;
    this.requestedThisConnection = true;
    this.sendRaw("capability_request", { requestedCapabilities: missing });
    this.log.info?.(`sdk: requested capabilities — missing grants: ${missing.join(", ")}`);
  }

  private async onCapabilitiesChanged(payload: CapabilitiesChangedPayload): Promise<void> {
    const before = this.capabilityNames;
    this.nextCapabilityChangeReason = payload.reason;
    await this.refreshCertStatus();
    this.nextCapabilityChangeReason = null;
    if (!this.capabilitySetChanged(before, this.capabilityNames)) {
      this.emitCapabilityChange(before, payload.reason, payload.certIds, { emitIfUnchanged: true });
    }
    this.maybeRequestCapabilities({ force: true });
  }

  private onCapabilityRegistryChanged(payload: CapabilityRegistryChangedPayload): void {
    const before = this.capabilityNames;
    this.emitCapabilityChange(before, payload.reason, undefined, { emitIfUnchanged: true });
    this.maybeRequestCapabilities({ force: true });
  }

  /**
   * The held certificate, in the shape `resolvePermission` expects.
   *
   * Returns an empty set — i.e. denies everything — when the certificate's status
   * is not verifiably good:
   *
   * - a verified status of anything but `active` (revoked/superseded/expired)
   * - a stale staple while `trust.failClosed` is set
   *
   * With `failClosed` off, a stale staple keeps the cached grant: that is the
   * documented meaning of fail-open, and the org setting is where that choice
   * belongs. Whether a *custom* capability is still registered is decided by the
   * control plane before it signs a response, so a name deleted from the registry
   * simply stops appearing in `this.capabilityNames` after the next refresh.
   */
  private activeCerts(options: { checkedAfter?: ReadonlyMap<string, number | null> } = {}): CapabilityCertificateLite[] {
    const out: CapabilityCertificateLite[] = [];
    for (const cert of this.certificates.values()) {
      if (cert.capabilities.length === 0) continue;
      if (cert.status !== null && cert.status !== "active") continue;
      if (options.checkedAfter) {
        if (cert.lastCheckedAt === options.checkedAfter.get(cert.certId)) continue;
      } else if (!this.isCertStatusFresh(cert) && this.failClosed()) {
        continue;
      }
      out.push({
        id: cert.certId,
        agentDid: this.getDid() ?? "",
        capabilities: cert.capabilities as AgentCapability[],
        resourceLimits: cert.resourceLimits,
        scope: cert.scope,
        status: "active",
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
      });
    }
    return out;
  }

  /** The org's fail mode, from the last `actor_config`. Absent config means fail closed. */
  private failClosed(): boolean {
    return this.actorConfig?.trust.failClosed ?? true;
  }

  /**
   * `trust.maxStatusAgeSeconds`, in ms, or `null` for "unbounded — never auto-refresh".
   *
   * 0 is the strictest setting and is **not** the same as unbounded: it means no cached status is
   * acceptable at all, so every decision must be preceded by a live query (see
   * {@link checkPermission}). Negative is unbounded, which has to be written explicitly so it can
   * never be reached by omission.
   */
  private maxStatusAgeMs(): number | null {
    const seconds = this.actorConfig?.trust.maxStatusAgeSeconds;
    if (seconds === undefined) return DEFAULTS.fallbackStatusIntervalMs;
    if (seconds < 0) return null;
    return seconds * 1000;
  }

  /** Whether the last verified status is recent enough to act on without re-querying. */
  private isStatusFresh(now: number = Date.now()): boolean {
    const cert = this.currentCertificate();
    return cert ? this.isCertStatusFresh(cert, now) : false;
  }

  private allStatusesFresh(now: number = Date.now()): boolean {
    if (this.certificates.size === 0) return false;
    for (const cert of this.certificates.values()) {
      if (!this.isCertStatusFresh(cert, now)) return false;
    }
    return true;
  }

  private isCertStatusFresh(cert: HeldCertificate, now: number = Date.now()): boolean {
    const maxAge = this.maxStatusAgeMs();
    if (maxAge === null) return true; // unbounded: whatever we hold counts as fresh
    if (cert.lastCheckedAt === null) return false; // never checked
    if (maxAge === 0) return false; // no cached status is ever acceptable
    return now - cert.lastCheckedAt <= maxAge;
  }

  /**
   * Ask the control plane for this certificate's current status and apply the answer.
   *
   * The response is verified against the control plane's own key — not merely trusted because it
   * arrived on an authenticated socket — so the decision rests on a signature, and the staple TTL
   * is enforced with the same `maxAgeMs` a third-party verifier would use.
   *
   * Applying the answer is the whole point: **capabilities are replaced by what the response
   * carries**, so a revoked grant, or a custom capability deleted from the registry, disappears
   * here. Resolves false when there is nothing to check or the check could not be completed;
   * a failed check never throws, and never silently upgrades a stale staple.
   */
  async refreshCertStatus(): Promise<boolean> {
    if (this.certificates.size === 0 || !this.vaultysId) return false;
    let refreshedAny = false;
    for (const certId of this.certificates.keys()) {
      if (await this.refreshOneCertStatus(certId)) refreshedAny = true;
    }
    return refreshedAny;
  }

  private async refreshOneCertStatus(certId: string): Promise<boolean> {
    if (!this.vaultysId) return false;
    const serverVid = this.serverVid();
    if (!serverVid) {
      this.log.debug?.("sdk: cannot check certificate status — server identity not established yet");
      return false;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    const nonce = randomUUID();
    let token: string;
    try {
      token = await signCertStatusRequestCert(this.vaultysId, {
        certId,
        requesterDid: this.getDid() ?? "",
        nonce,
      });
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return false;
    }

    const waitForResponse = new Promise<CertStatusResponseBody>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingStatusChecks.delete(nonce);
        reject(new Error("Timed out waiting for cert_status_response"));
      }, DEFAULTS.statusTimeoutMs);
      this.pendingStatusChecks.set(nonce, { resolve, reject, timer });
    });

    this.sendRaw("cert_status_request", { certToken: token });

    let body: CertStatusResponseBody;
    try {
      body = await waitForResponse;
    } catch (err) {
      // A failed check leaves the previous staple in place, unchanged. It does not become fresh,
      // so `failClosed` still bites once it ages out — which is the safe direction.
      this.log.warn?.(`sdk: certificate status check failed: ${String(err)}`);
      return false;
    }

    this.applyCertStatus(body);
    return true;
  }

  /**
   * Handle a `cert_status_response`.
   *
   * The nonce is not carried on the response (the wire format has no room for it), so a response
   * is matched to the single oldest in-flight request. In practice there is at most one — the
   * scheduler serialises refreshes — and a response that matches nothing is applied anyway rather
   * than dropped: it is still a signed, verified statement from the control plane about our own
   * certificate, and ignoring it would mean ignoring a revocation.
   */
  private onCertStatusResponse(payload: CertStatusResponsePayload): void {
    const serverVid = this.serverVid();
    if (!serverVid) {
      this.emit("error", new Error("Received cert_status_response before the server identity was established"));
      return;
    }

    const maxAge = this.maxStatusAgeMs();
    // A response older than the staple bound is refused here as it would be by any other verifier.
    // `maxAge === 0` would refuse everything including a just-signed response, so the freshness of
    // a *live* answer is not what that setting is about — it bounds caching, not signing latency.
    const body = verifyCertStatusResponseCert(
      serverVid,
      payload.certToken,
      maxAge === null || maxAge === 0 ? undefined : maxAge
    );
    if (!body) {
      const pending = this.pendingStatusChecks.entries().next();
      if (!pending.done) {
        const [nonce, waiter] = pending.value;
        clearTimeout(waiter.timer);
        this.pendingStatusChecks.delete(nonce);
        waiter.reject(new Error("cert_status_response failed verification or was too old"));
      }
      this.emit("error", new Error("Discarded an unverifiable cert_status_response"));
      return;
    }

    const pending = this.pendingStatusChecks.entries().next();
    if (!pending.done) {
      const [nonce, waiter] = pending.value;
      clearTimeout(waiter.timer);
      this.pendingStatusChecks.delete(nonce);
      waiter.resolve(body);
      return;
    }

    this.applyCertStatus(body);
  }

  /** Record a verified status response: status, timestamp, and the capabilities it reports. */
  private applyCertStatus(body: CertStatusResponseBody): void {
    const cert = this.certificates.get(body.certId);
    if (!cert) {
      this.log.debug?.(`sdk: ignoring status for another certificate (${body.certId})`);
      return;
    }

    const before = this.capabilityNames;
    const after = body.capabilities as string[];
    cert.status = body.status;
    cert.lastCheckedAt = body.checkedAt;
    cert.capabilities = after;
    cert.resourceLimits = body.resourceLimits;
    cert.scope = body.scope;
    cert.expiresAt = body.expiresAt;
    this.syncCertificateSnapshot();

    const changed = this.capabilitySetChanged(before, this.capabilityNames);

    this.persistCapabilityState();

    if (changed) {
      const lost = before.filter((c) => !this.capabilityNames.includes(c));
      if (lost.length > 0) {
        this.log.warn?.(`sdk: capabilities withdrawn by the control plane: ${lost.join(", ")}`);
      }
      this.emit("capabilities", this.capabilityNames);
      this.emitCapabilityChange(before, this.nextCapabilityChangeReason ?? "status_refresh", [body.certId]);
    }
    if (body.status !== "active") {
      this.log.warn?.(`sdk: certificate ${body.certId} is ${body.status} — it no longer authorizes anything`);
    }
  }

  /**
   * The control plane's identity, from the completed auth handshake.
   *
   * Taken from the handshake rather than from configuration deliberately: it is then necessarily
   * the same key that just authenticated this connection, so there is no second trust anchor to
   * keep in sync (or to get wrong).
   */
  private serverVid(): VaultysId | null {
    if (this.serverVidCache) return this.serverVidCache;
    if (!this.authHandshake?.isComplete()) return null;
    try {
      this.serverVidCache = this.authHandshake.contactId();
    } catch {
      return null;
    }
    return this.serverVidCache;
  }

  private persistCapabilityState(): void {
    if (this.certificates.size === 0) return;
    try {
      const current = this.currentCertificate();
      saveCapabilityState(this.cfg.capabilityStatePath, {
        certificates: [...this.certificates.values()].map((cert) => ({
          certId: cert.certId,
          certificate: cert.certificate,
          capabilities: cert.capabilities,
          resourceLimits: cert.resourceLimits,
          scope: cert.scope,
          lastStatus: cert.status ?? undefined,
          lastCheckedAt: cert.lastCheckedAt ?? undefined,
          issuedAt: cert.issuedAt,
          expiresAt: cert.expiresAt,
        })),
      });
      this.certId = current?.certId ?? null;
      this.certificate = current?.certificate ?? null;
    } catch (err) {
      this.emit("error", new Error(`Could not persist capability state: ${String(err)}`));
    }
  }

  private syncCertificateSnapshot(): void {
    const current = this.currentCertificate();
    this.certId = current?.certId ?? null;
    this.certificate = current?.certificate ?? null;
    this.lastStatus = current?.status ?? null;
    this.lastCheckedAt = current?.lastCheckedAt ?? null;

    const seen = new Set<string>();
    const next: string[] = [];
    for (const cert of this.certificates.values()) {
      if (cert.status !== null && cert.status !== "active") continue;
      for (const capability of cert.capabilities) {
        if (seen.has(capability)) continue;
        seen.add(capability);
        next.push(capability);
      }
    }
    this.capabilityNames = next;
  }

  private emitCapabilityChange(
    before: readonly string[],
    reason: CapabilityChange["reason"],
    certIds?: readonly string[],
    options: { emitIfUnchanged?: boolean } = {}
  ): void {
    const current = [...this.capabilitiesSnapshot()];
    const added = current.filter((capability) => !before.includes(capability));
    const removed = before.filter((capability) => !current.includes(capability));
    if (added.length === 0 && removed.length === 0 && !options.emitIfUnchanged) return;
    this.emit("capabilityChange", {
      current,
      added,
      removed,
      reason,
      ...(certIds && certIds.length > 0 ? { certIds } : {}),
    });
  }

  private capabilitySetChanged(before: readonly string[], after: readonly string[]): boolean {
    return before.length !== after.length || before.some((capability, i) => capability !== after[i]);
  }

  private currentCertificate(): HeldCertificate | null {
    let current: HeldCertificate | null = null;
    for (const cert of this.certificates.values()) {
      if (!current || cert.issuedAt >= current.issuedAt) current = cert;
    }
    return current;
  }

  /** (Re)arm the periodic status refresh from the current `trust.maxStatusAgeSeconds`. */
  private scheduleStatusChecks(): void {
    this.clearStatusTimer();
    const maxAge = this.maxStatusAgeMs();
    if (maxAge === null) {
      this.log.debug?.("sdk: certificate status refresh disabled (maxStatusAgeSeconds is negative)");
      return;
    }
    // Refresh at half the staleness bound so a single failed check doesn't immediately make the
    // staple stale — with `failClosed` that would mean denying everything on one dropped message.
    // `maxAge === 0` has no interval to halve: nothing may be cached, so there is nothing to keep
    // warm and every decision goes through `checkPermission`.
    if (maxAge === 0) {
      this.log.debug?.("sdk: maxStatusAgeSeconds is 0 — use checkPermission(), no cached status is acceptable");
      return;
    }
    const interval = Math.max(1_000, Math.floor(maxAge / 2));
    this.statusTimer = setInterval(() => {
      void this.refreshCertStatus();
    }, interval);
    this.statusTimer.unref?.();
  }

  private clearStatusTimer(): void {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
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
