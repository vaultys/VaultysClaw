/**
 * The connection lifecycle: accept a socket, run the VaultysId Challenger
 * handshake (identical crypto flow to packages/control-plane's
 * `lib/auth-handler.ts`, kept in-memory per connection here instead of
 * round-tripping an AuthSession row — this process is a long-lived WS
 * server, not a stateless API route, so there's nothing to survive a restart
 * for), then either auto-connect a known Principal or persist a
 * PendingRegistration for an unknown one.
 *
 * Deliberately does not yet implement: capability_request/grant over the
 * wire (needs an admin-approval UI to be meaningful — the primitives already
 * exist in lib/certificates.ts, ready to be called once that UI exists), or
 * the WebRTC/PeerJS transport (trust doc §4.4 — `AgentSender` is already
 * shaped for it, see lib/agent-sender.ts).
 */
import { randomBytes, randomUUID } from "crypto";
import type { WebSocket, WebSocketServer } from "ws";
import { Challenger, VaultysId, crypto as vCrypto } from "@vaultys/id";
import pino from "pino";
import {
  verifyCertStatusRequestCert,
  signCertStatusResponseCert,
  type CertificateStatus,
} from "@vaultysclaw/policy";
import { PrincipalDAO, PendingRegistrationDAO, CapabilityCertificateDAO, ServerIdentityDAO } from "@/db";
import { WsSender, type AgentSender } from "./agent-sender";
import type {
  AuthChallengePayload,
  AuthCompletePayload,
  AuthFailedPayload,
  CertStatusRequestPayload,
  CertStatusResponsePayload,
  ErrorPayload,
  ProtocolMessage,
  ProtocolMessageType,
  RegisterPayload,
  RegistrationPendingPayload,
} from "./protocol";

const logger = pino({ name: "ws-server" });
const Buf = vCrypto.Buffer;

const HANDSHAKE_TIMEOUT_MS = 30_000;

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

interface ConnectedPrincipal {
  did: string;
  name: string;
  kind: string;
  sender: AgentSender;
  /** The Principal's own public-key VaultysId, from the completed handshake — used to verify anything they sign afterward (cert_status_request, future capability_request). */
  remoteVid: VaultysId;
  connectedAt: Date;
  lastSeen: Date;
}

export class ControlPlaneWSServer {
  private pending = new Map<AgentSender, PendingConnection>();
  private connected = new Map<string, ConnectedPrincipal>();
  private connectedBySender = new Map<AgentSender, string>();

  constructor(wss: WebSocketServer) {
    wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
  }

  get connectedCount(): number {
    return this.connected.size;
  }

  isConnected(did: string): boolean {
    return this.connected.has(did);
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
    const did = this.connectedBySender.get(sender);
    if (did) {
      this.connectedBySender.delete(sender);
      this.connected.delete(did);
      logger.info({ did }, "Principal disconnected");
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

      const existing = await PrincipalDAO.findByDid(did);
      if (existing) {
        await PrincipalDAO.touchLastSeen(did);
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

        logger.info({ did, kind: existing.kind }, "Principal reconnected");
        return;
      }

      const registrationId = randomUUID();
      await PendingRegistrationDAO.create({
        id: registrationId,
        sessionId: pending.sessionId,
        name: pending.name,
        kind: pending.kind,
        requestedCapabilities: [],
      });

      this.sendMessage(sender, "registration_pending", {
        registrationId,
        message: "Identity verified. Registration pending admin approval.",
      } satisfies RegistrationPendingPayload);

      logger.info({ did, registrationId, kind: pending.kind }, "New Principal — pending admin approval");
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
    const principal = this.connected.get(did);
    if (!principal) return;
    principal.lastSeen = new Date();
    void PrincipalDAO.touchLastSeen(did);
    this.sendMessage(sender, "pong", {});
  }

  /**
   * The status-check protocol (docs/CERTIFICATE_WEB_OF_TRUST.md §4.1) — the
   * "OCSP of VaultysClaw". Only a connected, authenticated Principal may ask;
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

    this.sendMessage(sender, "cert_status_response", {
      certToken: responseToken,
    } satisfies CertStatusResponsePayload);
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
