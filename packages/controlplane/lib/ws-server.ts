/**
 * The connection lifecycle: accept a socket, run the VaultysId Challenger
 * handshake (identical crypto flow to packages/control-plane's
 * `lib/auth-handler.ts`, kept in-memory per connection here instead of
 * round-tripping an AuthSession row — this process is a long-lived WS
 * server, not a stateless API route, so there's nothing to survive a restart
 * for), then either auto-connect a known Actor or persist a
 * PendingRegistration for an unknown one.
 *
 * Also implements the interactive capability-issuance flow
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b): a connected Actor sends a
 * plain `capability_request`; once an admin approves it
 * (lib/registrations.ts), the control plane proactively runs a second,
 * separate Challenger exchange over the SAME connection with
 * `service: "certificate"` instead of `"auth"` — same mechanics as the auth
 * handshake, different purpose, per the protocol's own protocol/service
 * discriminator. Deliberately not yet implemented: the WebRTC/PeerJS
 * transport (trust doc §4.4 — `AgentSender` is already shaped for it, see
 * lib/agent-sender.ts).
 */
import { randomBytes, randomUUID } from "crypto";
import type { WebSocket, WebSocketServer } from "ws";
import { Challenger, VaultysId, crypto as vCrypto } from "@vaultys/id";
import pino from "pino";
import {
  verifyCertStatusRequestCert,
  signCertStatusResponseCert,
  type AgentCapability,
  type CertificateStatus,
} from "@vaultysclaw/policy";
import {
  ActorDAO,
  PendingRegistrationDAO,
  CapabilityCertificateDAO,
  CertStatusCheckDAO,
  SensorWorkloadDAO,
  ServerIdentityDAO,
} from "@/db";
import { persistChallengerCertificate } from "./certificates";
import { recordEvent } from "./audit";
import { buildAdminUrl } from "./webhook-payloads";
import { WsSender, type AgentSender } from "./agent-sender";
import type {
  AuthChallengePayload,
  AuthCompletePayload,
  AuthFailedPayload,
  CapabilityRequestPayload,
  CertChallengePayload,
  CertFailedPayload,
  CertIssuedPayload,
  CertStatusRequestPayload,
  CertStatusResponsePayload,
  ErrorPayload,
  ProtocolMessage,
  ProtocolMessageType,
  RegisterPayload,
  RegistrationPendingPayload,
  SensorTelemetryPayload,
} from "./protocol";

const logger = pino({ name: "ws-server" });
const Buf = vCrypto.Buffer;

const HANDSHAKE_TIMEOUT_MS = 30_000;
const DEFAULT_GRANT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Same two-condition check as packages/shared's `verifyProtocol` — inlined rather than
 * pulling in a dependency on the legacy shared package for one pure 2-line helper. */
function verifyProtocol(challenger: Challenger): boolean {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && (service === "register" || service === "auth");
}

interface PendingConnection {
  sender: AgentSender;
  sessionId: string;
  name: string;
  kind: string;
  challenger: Challenger | null;
  timer: ReturnType<typeof setTimeout>;
}

interface ConnectedActor {
  did: string;
  name: string;
  kind: string;
  sender: AgentSender;
  /** The Actor's own public-key VaultysId, from the completed handshake — used to verify anything they sign afterward (cert_status_request). */
  remoteVid: VaultysId;
  connectedAt: Date;
  lastSeen: Date;
}

/** A connection that completed auth but is awaiting admin approval — tracked so a later
 *  `capability_request` message on the same still-open socket can be tied back to its row. */
interface AwaitingApproval {
  did: string;
  registrationId: string;
}

/** In-flight `service: "certificate"` exchange (trust doc §3.2b) — mirrors `PendingConnection`
 *  but for issuance rather than initial auth, over an already-authenticated connection. */
interface CertIssuanceState {
  sessionId: string;
  registrationId: string;
  capabilities: AgentCapability[];
  challenger: Challenger | null;
}

const globalForWsServer = globalThis as unknown as { __wsServerInstance?: ControlPlaneWSServer };

/** Set by server.ts after construction — lets Server Actions (lib/registrations.ts) reach the
 *  live connection map from the Next.js request-handling side of the same process. */
export function setWSServerInstance(instance: ControlPlaneWSServer): void {
  globalForWsServer.__wsServerInstance = instance;
}

export function getWSServerInstance(): ControlPlaneWSServer | null {
  return globalForWsServer.__wsServerInstance ?? null;
}

export class ControlPlaneWSServer {
  private pending = new Map<AgentSender, PendingConnection>();
  private connected = new Map<string, ConnectedActor>();
  private connectedBySender = new Map<AgentSender, string>();
  private awaitingApproval = new Map<AgentSender, AwaitingApproval>();
  private certIssuance = new Map<AgentSender, CertIssuanceState>();

  constructor(wss: WebSocketServer) {
    wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
  }

  get connectedCount(): number {
    return this.connected.size;
  }

  isConnected(did: string): boolean {
    return this.connected.has(did);
  }

  /**
   * Called by lib/registrations.ts right after an admin approves a
   * PendingRegistration. If the agent is connected right now, immediately
   * starts the certificate-issuance exchange and returns true; otherwise
   * returns false and delivery waits for the agent's next `auth` handshake
   * (see `deliverIfApproved`, invoked from the `existing` branch of
   * `handleAuthChallenge` below).
   *
   * A first-time registrant is still sitting on the same open socket in
   * `awaitingApproval` — it never went through the "existing Actor"
   * reconnect branch, so it was never promoted into `connected`. Promote it
   * now rather than forcing a reconnect just to receive its own grant.
   */
  async deliverApprovedCapabilities(did: string): Promise<boolean> {
    const approved = await PendingRegistrationDAO.findApprovedUndelivered(did);
    if (!approved) return false;
    const capabilities = approved.assignedCapabilities as AgentCapability[];

    for (const [sender, awaiting] of this.awaitingApproval) {
      if (awaiting.did !== did) continue;
      this.awaitingApproval.delete(sender);
      const remoteVid = approved.publicKey
        ? VaultysId.fromId(Buf.from(approved.publicKey, "base64") as never).toVersion(1)
        : null;
      if (remoteVid) {
        this.connected.set(did, {
          did,
          name: approved.name,
          kind: approved.kind,
          sender,
          remoteVid,
          connectedAt: new Date(),
          lastSeen: new Date(),
        });
        this.connectedBySender.set(sender, did);
      }
      // This connection has never received auth_complete — it went straight from the
      // handshake into registration_pending, and now approval, without ever being told
      // "you're connected." Every client (not just ones that also understand the
      // capability sub-protocol — e.g. vaultysclaw-sensor, which has no capability
      // concept at all) needs this before anything else, cert_challenge included.
      this.sendMessage(sender, "auth_complete", { did } satisfies AuthCompletePayload);
      if (capabilities.length === 0) {
        await PendingRegistrationDAO.markDelivered(approved.id);
      } else {
        this.startCertificateIssuance(sender, approved.id, capabilities);
      }
      return true;
    }

    const actor = this.connected.get(did);
    if (!actor) return false;
    if (capabilities.length === 0) {
      await PendingRegistrationDAO.markDelivered(approved.id);
    } else {
      this.startCertificateIssuance(actor.sender, approved.id, capabilities);
    }
    return true;
  }

  // ─── Connection lifecycle ───────────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    const sender = new WsSender(ws);
    ws.on("message", (data: Buffer) => this.handleMessage(sender, data.toString()));
    ws.on("close", () => this.handleClose(sender));
    ws.on("error", (err) => logger.warn({ err }, "socket error"));
  }

  private handleClose(sender: AgentSender): void {
    this.pending.delete(sender);
    this.awaitingApproval.delete(sender);
    this.certIssuance.delete(sender);
    const did = this.connectedBySender.get(sender);
    if (did) {
      this.connectedBySender.delete(sender);
      this.connected.delete(did);
      logger.info({ did }, "Actor disconnected");
    }
  }

  private handleMessage(sender: AgentSender, raw: string): void {
    let message: ProtocolMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      this.sendError(sender, "Malformed message");
      return;
    }

    switch (message.type) {
      case "register":
        this.handleRegister(sender, message.payload as RegisterPayload);
        return;
      case "auth_challenge":
        void this.handleAuthChallenge(sender, message.payload as AuthChallengePayload);
        return;
      case "heartbeat":
        this.handleHeartbeat(sender);
        return;
      case "cert_status_request":
        void this.handleCertStatusRequest(sender, message.payload as CertStatusRequestPayload);
        return;
      case "capability_request":
        void this.handleCapabilityRequest(sender, message.payload as CapabilityRequestPayload);
        return;
      case "cert_challenge":
        void this.handleCertChallenge(sender, message.payload as CertChallengePayload);
        return;
      case "sensor_telemetry":
        void this.handleSensorTelemetry(sender, message.payload as SensorTelemetryPayload);
        return;
      default:
        this.sendError(sender, `Unhandled message type: ${message.type}`);
    }
  }

  // ─── Registration + auth handshake ──────────────────────────────────────

  private handleRegister(sender: AgentSender, payload: RegisterPayload): void {
    const sessionId = randomBytes(16).toString("hex");
    const timer = setTimeout(() => {
      logger.warn({ sessionId }, "Handshake timed out");
      this.sendMessage(sender, "auth_failed", { reason: "Handshake timeout" } satisfies AuthFailedPayload);
      sender.close();
      this.pending.delete(sender);
    }, HANDSHAKE_TIMEOUT_MS);

    this.pending.set(sender, {
      sender,
      sessionId,
      name: payload.name ?? "unknown",
      kind: payload.kind ?? "openclaw",
      challenger: null,
      timer,
    });

    this.sendMessage(sender, "auth_challenge", { sessionId, data: "" } satisfies AuthChallengePayload);
  }

  private async handleAuthChallenge(
    sender: AgentSender,
    payload: AuthChallengePayload
  ): Promise<void> {
    const pending = this.pending.get(sender);
    if (!pending || pending.sessionId !== payload.sessionId) {
      this.sendError(sender, "No matching session");
      return;
    }

    try {
      const serverVid = await ServerIdentityDAO.getServerVaultysId();
      if (!pending.challenger) {
        pending.challenger = new Challenger(serverVid);
      }
      const challenger = pending.challenger;

      await challenger.update(Buf.from(payload.data, "base64"));
      const certificate = challenger.getCertificate();
      const certB64 = Buf.from(certificate).toString("base64");

      if (challenger.hasFailed()) {
        const reason = challenger.challenge?.error ?? "Challenge failed";
        this.failHandshake(pending, reason);
        return;
      }

      if (!verifyProtocol(challenger)) {
        this.failHandshake(pending, "Protocol tampered");
        return;
      }

      if (!challenger.isComplete()) {
        this.sendMessage(sender, "auth_challenge", {
          sessionId: pending.sessionId,
          data: certB64,
        } satisfies AuthChallengePayload);
        return;
      }

      // Handshake complete — identity is cryptographically proven.
      clearTimeout(pending.timer);
      this.pending.delete(sender);

      const contact = challenger.getContactId().toVersion(1);
      const did = contact.did;

      const existing = await ActorDAO.findByDid(did);
      if (existing) {
        await ActorDAO.touchLastSeen(did);
        this.connected.set(did, {
          did,
          name: existing.name,
          kind: existing.kind,
          sender,
          remoteVid: contact,
          connectedAt: new Date(),
          lastSeen: new Date(),
        });
        this.connectedBySender.set(sender, did);

        this.sendMessage(sender, "auth_complete", { did } satisfies AuthCompletePayload);
        // One more round so the client's own Challenger also reaches completion.
        this.sendMessage(sender, "auth_challenge", {
          sessionId: pending.sessionId,
          data: certB64,
        } satisfies AuthChallengePayload);

        logger.info({ did, kind: existing.kind }, "Actor reconnected");

        // A grant may have been approved while this Actor was offline —
        // deliver it now that they're back (trust doc §3.2b).
        void this.deliverApprovedCapabilities(did);
        return;
      }

      // A pending agent is expected to retry/reconnect while awaiting approval —
      // reuse the existing row instead of piling up a duplicate per attempt.
      const existingPending = await PendingRegistrationDAO.findPendingByDid(did);
      const registrationId = existingPending?.id ?? randomUUID();
      if (!existingPending) {
        await PendingRegistrationDAO.create({
          id: registrationId,
          did,
          publicKey: Buf.from(contact.id).toString("base64"),
          sessionId: pending.sessionId,
          name: pending.name,
          kind: pending.kind,
          requestedCapabilities: [],
        });
        await recordEvent({
          eventType: "actor.registration_requested",
          payload: {
            did,
            name: pending.name,
            kind: pending.kind,
            registrationId,
            // No human origin — an agent's own connection attempt, not an admin action — and no
            // Actor row exists yet either, so this links to the list, not a detail page.
            adminUrl: buildAdminUrl("/admin/actors"),
          },
          targetType: "actor",
          targetId: did,
        });
      }
      this.awaitingApproval.set(sender, { did, registrationId });

      this.sendMessage(sender, "registration_pending", {
        registrationId,
        message: "Identity verified. Registration pending admin approval.",
      } satisfies RegistrationPendingPayload);

      logger.info({ did, registrationId, kind: pending.kind }, "New Actor — pending admin approval");
    } catch (err) {
      logger.error({ err }, "Error processing auth challenge");
      this.failHandshake(pending, "Internal error");
    }
  }

  private failHandshake(pending: PendingConnection, reason: string): void {
    this.sendMessage(pending.sender, "auth_failed", { reason } satisfies AuthFailedPayload);
    pending.sender.close();
    clearTimeout(pending.timer);
    this.pending.delete(pending.sender);
    logger.warn({ sessionId: pending.sessionId, reason }, "Handshake failed");
  }

  // ─── Post-auth messages ──────────────────────────────────────────────────

  private handleHeartbeat(sender: AgentSender): void {
    const did = this.connectedBySender.get(sender);
    if (!did) return;
    const actor = this.connected.get(did);
    if (!actor) return;
    actor.lastSeen = new Date();
    void ActorDAO.touchLastSeen(did);
    this.sendMessage(sender, "pong", {});
  }

  /**
   * A plain, unsigned request (trust doc §3.2b) — no signature needed since
   * it only ever arrives over an already-authenticated connection. Creates
   * or updates a PendingRegistration; an admin decides from there
   * (lib/registrations.ts).
   */
  private async handleCapabilityRequest(
    sender: AgentSender,
    payload: CapabilityRequestPayload
  ): Promise<void> {
    const awaiting = this.awaitingApproval.get(sender);
    if (awaiting) {
      await PendingRegistrationDAO.updateRequestedCapabilities(
        awaiting.registrationId,
        payload.requestedCapabilities
      );
      logger.info(
        { registrationId: awaiting.registrationId, capabilities: payload.requestedCapabilities },
        "Capability request recorded for pending registration"
      );
      return;
    }

    const did = this.connectedBySender.get(sender);
    if (!did) {
      this.sendError(sender, "Not authenticated");
      return;
    }

    const actor = this.connected.get(did);
    const existingPending = await PendingRegistrationDAO.findPendingByDid(did);
    if (existingPending) {
      await PendingRegistrationDAO.updateRequestedCapabilities(
        existingPending.id,
        payload.requestedCapabilities
      );
      return;
    }

    const registrationId = randomUUID();
    await PendingRegistrationDAO.create({
      id: registrationId,
      did,
      publicKey: actor ? Buf.from(actor.remoteVid.id).toString("base64") : null,
      sessionId: randomBytes(16).toString("hex"),
      name: actor?.name ?? did,
      kind: actor?.kind ?? "openclaw",
      requestedCapabilities: payload.requestedCapabilities,
    });
    logger.info({ did, registrationId }, "Connected Actor requested additional capabilities");
  }

  /** Proactively prompts a connected Actor into a service:"certificate" exchange — same
   *  mechanics as handleRegister's opening auth_challenge, different purpose. */
  private startCertificateIssuance(
    sender: AgentSender,
    registrationId: string,
    capabilities: AgentCapability[]
  ): void {
    const sessionId = randomBytes(16).toString("hex");
    this.certIssuance.set(sender, { sessionId, registrationId, capabilities, challenger: null });
    this.sendMessage(sender, "cert_challenge", { sessionId, data: "" } satisfies CertChallengePayload);
    logger.info({ registrationId }, "Initiating certificate issuance exchange");
  }

  private async handleCertChallenge(sender: AgentSender, payload: CertChallengePayload): Promise<void> {
    const state = this.certIssuance.get(sender);
    if (!state || state.sessionId !== payload.sessionId) {
      this.sendError(sender, "No matching certificate session");
      return;
    }

    try {
      const serverVid = await ServerIdentityDAO.getServerVaultysId();
      if (!state.challenger) {
        state.challenger = new Challenger(serverVid);
      }
      const challenger = state.challenger;

      // No metadata embedded here: github.com/vaultys/vaultysid/go's Challenger (vaultysclaw-sensor's
      // client) has a verification bug where Step2/Finalize reconstruct the payload they check a
      // peer's signature against with metadata hardcoded to empty, instead of what was actually
      // received — any certificate with non-empty signed metadata fails Go-side verification with
      // "invalid signature", even though the TS side is completely correct on both ends. The
      // certificate itself proves mutual live presence only; the actual capabilities granted travel
      // as a plain field on cert_issued below, not something every Challenger implementation needs
      // to agree on how to sign/verify identically.
      await challenger.update(Buf.from(payload.data, "base64"));

      const certificate = challenger.getCertificate();
      const certB64 = Buf.from(certificate).toString("base64");

      if (challenger.hasFailed()) {
        this.failCertIssuance(sender, state, challenger.challenge?.error ?? "Challenge failed");
        return;
      }
      if (challenger.getContext().service !== "certificate") {
        this.failCertIssuance(sender, state, "Unexpected service — expected 'certificate'");
        return;
      }

      if (!challenger.isComplete()) {
        this.sendMessage(sender, "cert_challenge", {
          sessionId: state.sessionId,
          data: certB64,
        } satisfies CertChallengePayload);
        return;
      }

      // Complete — both sides mutually proved presence. Persist and deliver.
      this.certIssuance.delete(sender);

      const registration = await PendingRegistrationDAO.findById(state.registrationId);
      if (!registration) {
        this.sendMessage(sender, "cert_failed", {
          reason: "Registration no longer exists",
        } satisfies CertFailedPayload);
        return;
      }

      const certId = randomUUID();
      await persistChallengerCertificate({
        certId,
        agentDid: registration.did,
        workspaceId: registration.targetWorkspaceId,
        capabilities: state.capabilities,
        certificateBase64: certB64,
        expiresAt: Date.now() + DEFAULT_GRANT_TTL_MS,
        issuedBy: registration.approvedBy,
      });
      await PendingRegistrationDAO.markDelivered(registration.id);

      this.sendMessage(sender, "cert_issued", {
        certId,
        certificate: certB64,
        capabilities: state.capabilities,
      } satisfies CertIssuedPayload);
      logger.info({ did: registration.did, certId }, "Capability certificate delivered via live exchange");
    } catch (err) {
      logger.error({ err }, "Error during certificate issuance exchange");
      this.failCertIssuance(sender, state, "Internal error");
    }
  }

  private failCertIssuance(sender: AgentSender, state: CertIssuanceState, reason: string): void {
    this.certIssuance.delete(sender);
    this.sendMessage(sender, "cert_failed", { reason } satisfies CertFailedPayload);
    logger.warn({ registrationId: state.registrationId, reason }, "Certificate issuance failed");
  }

  /**
   * The status-check protocol (docs/CERTIFICATE_WEB_OF_TRUST.md §4.1) — the
   * "OCSP of VaultysClaw". Only a connected, authenticated Actor may ask;
   * the response is signed by the control plane so it can be cached/stapled/
   * forwarded and still independently verified later.
   */
  private async handleCertStatusRequest(
    sender: AgentSender,
    payload: CertStatusRequestPayload
  ): Promise<void> {
    const requesterDid = this.connectedBySender.get(sender);
    if (!requesterDid) {
      this.sendError(sender, "Not authenticated");
      return;
    }
    const requester = this.connected.get(requesterDid);
    if (!requester) {
      this.sendError(sender, "Not authenticated");
      return;
    }

    const requestBody = verifyCertStatusRequestCert(requester.remoteVid, payload.certToken);
    if (!requestBody) {
      this.sendError(sender, "Invalid or unverifiable cert_status_request");
      return;
    }

    const cert = await CapabilityCertificateDAO.findById(requestBody.certId);
    if (!cert) {
      this.sendError(sender, `Unknown certificate: ${requestBody.certId}`);
      return;
    }

    let status = cert.status as CertificateStatus;
    if (status === "active" && cert.expiresAt && cert.expiresAt.getTime() <= Date.now()) {
      status = "expired";
    }

    const serverVid = await ServerIdentityDAO.getServerVaultysId();
    const responseToken = await signCertStatusResponseCert(serverVid, {
      certId: cert.id,
      agentDid: cert.agentDid,
      status,
      capabilities: cert.capabilities as never,
      resourceLimits: cert.resourceLimits as never,
      scope: cert.scope as never,
      expiresAt: cert.expiresAt ? cert.expiresAt.getTime() : null,
    });

    void CertStatusCheckDAO.record({ certId: cert.id, requesterDid, status });

    this.sendMessage(sender, "cert_status_response", {
      certToken: responseToken,
    } satisfies CertStatusResponsePayload);
  }

  /**
   * A `kind: "sensor"` Actor's classified AI/agent process observations
   * (vaultysclaw-sensor/docs/vaultysclaw-integration.md §3). Current-state
   * upsert by (deviceDid, fingerprint), not an append-only log — the sensor
   * reports deltas for the same workload repeatedly. `deviceDid` is the
   * connection's own authenticated identity (`connectedBySender`), never a
   * client-claimed field, even though the sensor also sets one on the wire.
   */
  private async handleSensorTelemetry(
    sender: AgentSender,
    payload: SensorTelemetryPayload
  ): Promise<void> {
    const deviceDid = this.connectedBySender.get(sender);
    if (!deviceDid) {
      this.sendError(sender, "Not authenticated");
      return;
    }

    // Device-level fields (hostname/os) aren't Actor columns — they're kind-specific, so they live
    // in kindConfig (docs/REBUILD_ARCHITECTURE.md §4.3) rather than growing the shared model. Every
    // event repeats the same Device block, so the first one in the batch is enough.
    const device = payload.events?.[0]?.device;
    if (device) {
      void ActorDAO.mergeKindConfig(deviceDid, { hostname: device.hostname, os: device.os }).catch((err) =>
        logger.error({ err, deviceDid }, "Failed to merge sensor device info into Actor kindConfig")
      );
    }

    let accepted = 0;
    for (const event of payload.events ?? []) {
      if (event.schemaVersion !== 1) {
        logger.warn({ deviceDid, schemaVersion: event.schemaVersion }, "Skipping sensor event with unsupported schema version");
        continue;
      }
      await SensorWorkloadDAO.upsert(deviceDid, {
        fingerprint: event.workload.fingerprint,
        eventType: event.type,
        process: {
          name: event.workload.process.name,
          executable: event.workload.process.executable,
          command: event.workload.process.command,
          user: event.workload.process.user,
        },
        provider: event.workload.provider,
        model: event.workload.model,
        aiConfidence: event.workload.aiConfidence,
        agentConfidence: event.workload.agentConfidence,
        reasons: event.workload.reasons ?? [],
        isMcp: event.workload.isMcp ?? false,
        mcpServers: event.workload.mcpServers ?? [],
        isLocalRuntime: event.workload.isLocalRuntime ?? false,
        identityEvidence: event.workload.identityEvidence,
      });
      accepted++;
    }
    logger.info({ deviceDid, accepted }, "Sensor telemetry accepted");
  }

  // ─── Send helpers ────────────────────────────────────────────────────────

  private sendMessage(sender: AgentSender, type: ProtocolMessageType, payload: unknown): void {
    const message: ProtocolMessage = {
      messageId: randomUUID(),
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    sender.sendRaw(JSON.stringify(message));
  }

  private sendError(sender: AgentSender, reason: string): void {
    this.sendMessage(sender, "error", { reason } satisfies ErrorPayload);
  }
}
