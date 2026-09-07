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
  filterAgainstRegistry,
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
  CustomCapabilityDAO,
} from "@/db";
import { persistChallengerCertificate, selectRedeliverableCertificate } from "./certificates";
import { recordEvent } from "./audit";
import { buildAdminUrl } from "./webhook-payloads";
import { WsSender, type AgentSender } from "./agent-sender";
import { buildActorConfig } from "./actor-config";
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
  DeclaredCapability,
  RegisterPayload,
  RegistrationPendingPayload,
  SensorTelemetryPayload,
} from "./protocol";

const logger = pino({ name: "ws-server" });
const Buf = vCrypto.Buffer;

/**
 * How often deferred writes are flushed.
 *
 * Sized against what the deferred data is for: `lastSeen` is a human-readable "when did we last
 * hear from this" on an admin page, and an audit row a few seconds late is still an audit row. Long
 * enough to coalesce a fleet's heartbeats into one statement, short enough that an admin refreshing
 * a page does not notice.
 */
const FLUSH_INTERVAL_MS = 5_000;

/**
 * How often to look for approved grants that nobody delivered, and how many to deliver per pass.
 *
 * The batch is what keeps this from becoming a stampede: each delivery starts a live certificate
 * exchange, so an unbounded sweep across a large fleet would do exactly what the connection ramp
 * exists to prevent. A backlog simply drains over several passes.
 */
const DELIVERY_SWEEP_INTERVAL_MS = 3_000;
const DELIVERY_SWEEP_BATCH = 100;

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
  /** From `register`, held until the handshake proves a DID to attribute it to. */
  declaredCapabilities?: DeclaredCapability[];
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

  /**
   * Writes deferred out of the per-message hot paths and flushed on a timer.
   *
   * Both of these scale with the size of the fleet rather than with admin activity, and neither is
   * read by anything that needs it to be current: `lastSeen` is a display timestamp ("online now"
   * comes from `connected`, in memory), and `CertStatusCheck` is append-only audit data. Writing
   * them inline made a heartbeat and a certificate re-check each cost a database round trip, which
   * at thousands of Actors is most of the write load for no benefit.
   */
  private lastSeenBuffer = new Set<string>();
  private statusCheckBuffer: { certId: string; requesterDid: string; status: string; checkedAt: Date }[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private deliverySweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepInFlight = false;

  constructor(wss: WebSocketServer) {
    wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
    this.flushTimer = setInterval(() => void this.flushDeferredWrites(), FLUSH_INTERVAL_MS);
    // Never hold the process open for a flush timer — the buffers are best-effort by construction.
    this.flushTimer.unref?.();

    this.deliverySweepTimer = setInterval(() => void this.sweepUndeliveredGrants(), DELIVERY_SWEEP_INTERVAL_MS);
    this.deliverySweepTimer.unref?.();
  }

  /**
   * Write out the deferred buffers.
   *
   * Failures are logged and the batch dropped rather than retried: both buffers hold data whose
   * value decays immediately (a stale `lastSeen`, an audit row for a check that already happened),
   * and retrying would let a database outage grow an unbounded in-memory queue in a process whose
   * job is holding thousands of live sockets. What must never be lost — certificates, approvals,
   * revocations — is written inline and awaited, and none of it goes through here.
   */
  private async flushDeferredWrites(): Promise<void> {
    if (this.lastSeenBuffer.size > 0) {
      const dids = [...this.lastSeenBuffer];
      this.lastSeenBuffer.clear();
      try {
        await ActorDAO.touchLastSeenBatch(dids);
      } catch (err) {
        logger.warn({ err, count: dids.length }, "Failed to flush lastSeen batch; dropping it");
      }
    }

    if (this.statusCheckBuffer.length > 0) {
      const rows = this.statusCheckBuffer;
      this.statusCheckBuffer = [];
      try {
        await CertStatusCheckDAO.recordBatch(rows);
      } catch (err) {
        logger.warn({ err, count: rows.length }, "Failed to flush status-check batch; dropping it");
      }
    }
  }

  /**
   * Deliver approved grants to Actors that are connected right now.
   *
   * `approvePendingRegistration` calls `deliverApprovedCapabilities` directly, so the normal admin
   * path never needs this. It exists for every *other* way a registration can become approved — a
   * script, a bulk import, a second control-plane instance, direct SQL — none of which can reach
   * this process's connection map. Without it, such an Actor holds an approved grant it cannot
   * collect until it happens to reconnect, which for a long-lived agent may be never.
   *
   * Bounded per sweep because delivery starts a live Challenger exchange: certifying every
   * connected Actor at once is exactly the handshake stampede the rest of this file avoids, and a
   * sweep that outruns the previous one would start a second exchange on a connection already
   * mid-exchange.
   */
  private async sweepUndeliveredGrants(): Promise<void> {
    if (this.sweepInFlight) return;
    this.sweepInFlight = true;
    try {
      // Both maps, not just `connected`. A first-time registrant never enters `connected` at all:
      // it goes handshake → `registration_pending` → `awaitingApproval`, and is only promoted once
      // its grant is actually delivered. Querying `connected` alone therefore missed every Actor
      // this sweep exists to serve — measured as `found: 1` against a fleet of 6,084 awaiting
      // delivery. `deliverApprovedCapabilities` already handles both cases.
      const reachableDids = new Set<string>(this.connected.keys());
      for (const awaiting of this.awaitingApproval.values()) reachableDids.add(awaiting.did);
      if (reachableDids.size === 0) return;

      const pending = await PendingRegistrationDAO.findApprovedUndeliveredForDids([...reachableDids]);
      if (pending.length === 0) return;

      // `deliveredAt` is only stamped when an exchange *completes*, so an Actor mid-exchange still
      // matches the query. Filtering them out here is what stops a sweep from spending its whole
      // batch re-selecting the same Actors while their exchanges are in flight.
      const midExchange = this.didsMidCertificateExchange();
      const eligible = pending.filter((reg) => !midExchange.has(reg.did));
      if (eligible.length === 0) return;

      const batch = eligible.slice(0, DELIVERY_SWEEP_BATCH);
      logger.info(
        { found: pending.length, inFlight: midExchange.size, delivering: batch.length },
        "Delivering approved grants to connected Actors"
      );
      // Concurrently: each call only *starts* an exchange, but it does a few queries first, and
      // awaiting them one at a time capped the sweep at roughly one batch per interval regardless
      // of the batch size.
      await Promise.all(
        batch.map((reg) =>
          this.deliverApprovedCapabilities(reg.did).catch((err) =>
            logger.warn({ err, did: reg.did }, "Grant delivery failed for one Actor")
          )
        )
      );
    } catch (err) {
      logger.warn({ err }, "Grant delivery sweep failed; will retry on the next interval");
    } finally {
      this.sweepInFlight = false;
    }
  }

  /** DIDs whose connection is currently in the middle of a certificate exchange. */
  private didsMidCertificateExchange(): Set<string> {
    const dids = new Set<string>();
    for (const sender of this.certIssuance.keys()) {
      const did = this.connectedBySender.get(sender);
      if (did) {
        dids.add(did);
        continue;
      }
      // A first-time registrant is mid-exchange before it is ever promoted into `connected`, so it
      // has no `connectedBySender` entry yet — find it by sender in the awaiting map instead.
      const awaiting = this.awaitingApproval.get(sender);
      if (awaiting) dids.add(awaiting.did);
    }
    return dids;
  }

  /** Stop the timers and write out whatever is buffered. For tests and clean shutdown. */
  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    if (this.deliverySweepTimer) clearInterval(this.deliverySweepTimer);
    this.deliverySweepTimer = null;
    await this.flushDeferredWrites();
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
    // Re-filter at delivery time, not just at approval: a custom capability can be deleted from
    // the registry in the window between an admin approving an offline Actor and that Actor
    // reconnecting to collect its grant. Without this, delivery would mint a certificate carrying
    // a name the very next status refresh strips out (docs/CUSTOM_CAPABILITIES.md Phase 3a).
    const registryNames = new Set(await CustomCapabilityDAO.listNames());
    const capabilities = filterAgainstRegistry(
      approved.assignedCapabilities as string[],
      registryNames
    );

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

  /**
   * Close a connected Actor's socket, if it has one.
   *
   * Called when an Actor is deleted. Without it the client keeps a socket the
   * control plane no longer has a row for, and its next message is handled
   * against a DID that resolves to nothing — the client sees a connection that
   * works while being, as far as the ledger is concerned, nobody.
   *
   * A no-op for an offline Actor, which needs nothing: it has no session to
   * lose, and its grants were revoked before this was called.
   */
  disconnect(did: string): void {
    const conn = this.connected.get(did);
    if (!conn) return;
    logger.info({ did }, "Closing an Actor's connection after deletion");
    conn.sender.close();
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
      // Held until the handshake proves a DID — there is nobody to attribute a declaration to
      // before that, and an unauthenticated socket must not be able to write to any Actor row.
      declaredCapabilities: Array.isArray(payload.declaredCapabilities)
        ? payload.declaredCapabilities
        : undefined,
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
        // Buffered rather than awaited: this was a synchronous write sitting inside the handshake,
        // so every reconnecting Actor paid a database round trip before it could be told it was
        // connected. Nothing reads `lastSeen` closely enough to justify that (see `lastSeenBuffer`).
        this.lastSeenBuffer.add(did);
        // Recorded now that the DID is cryptographically proven. Informational only — it drives
        // the "wanted / registered / granted" diff on the Actor page and nothing else; an Actor
        // cannot grant itself anything by declaring it (docs/CUSTOM_CAPABILITIES.md Phase 4).
        //
        // Written only when it actually changed. An Actor's manifest is fixed for the life of its
        // build, so writing on every reconnect is an UPDATE per reconnect that stores the bytes
        // already there — and reconnects are the one thing a flaky fleet does constantly. The row
        // is already in hand from the lookup above, so the comparison is free.
        if (
          pending.declaredCapabilities &&
          !sameDeclaredCapabilities(existing.declaredCapabilities, pending.declaredCapabilities)
        ) {
          void ActorDAO.setDeclaredCapabilities(did, pending.declaredCapabilities);
        }
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

        // A reconnecting interception point must not resume enforcing on state
        // from before it went away — a certificate may have been revoked or a
        // rule added while it was gone. Fire-and-forget: a failed push leaves the
        // agent on its last *verified* config, which is the safe direction, and
        // its own staleness bound is what caps how long that lasts (§7.1).
        void this.pushActorConfig(did);

        // A grant may have been approved while this Actor was offline —
        // deliver it now that they're back (trust doc §3.2b). If there is
        // nothing pending, re-send whatever the Actor already holds, so a
        // reconnect never has to ask for something it was granted long ago.
        void this.deliverApprovedCapabilities(did).then((delivered) => {
          if (!delivered) void this.redeliverExistingCertificate(sender, did);
        });
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
    // Buffered, not written: see `lastSeenBuffer`. The in-memory value above is what every
    // "online" indicator actually reads, and it is already current.
    this.lastSeenBuffer.add(did);
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

    // An approved grant that hasn't been delivered yet already answers this request — delivery
    // happens over the certificate exchange moments from now. Without this check the Actor's
    // reconnect (which is *how* it collects the grant) files a second registration, so an admin
    // sees a fresh "pending" row for an Actor they just approved, and the approval queue grows one
    // phantom entry per approved Actor. Found by the fleet simulator: every one of its Actors ended
    // a run with both an approved and a pending registration.
    const approvedUndelivered = await PendingRegistrationDAO.findApprovedUndelivered(did);
    if (approvedUndelivered) {
      logger.debug(
        { did, registrationId: approvedUndelivered.id },
        "Capability request ignored — an approved grant is already awaiting delivery"
      );
      return;
    }

    const existingPending = await PendingRegistrationDAO.findPendingByDid(did);
    if (existingPending) {
      await PendingRegistrationDAO.updateRequestedCapabilities(
        existingPending.id,
        payload.requestedCapabilities
      );
      return;
    }

    // Everything asked for is already held: answer from the ledger instead of
    // asking an admin to approve what they already approved.
    //
    // A client asks whenever it has nothing granted *in memory*, which is every
    // reconnect for any client that does not cache its grant locally — and not
    // caching is the correct choice for one that treats the certificate as its
    // only source of truth. Without this, each restart filed a fresh
    // `PendingRegistration` and the approval queue grew one phantom row per
    // reconnect, for an Actor that was never actually missing anything.
    if (await this.redeliverExistingCertificate(sender, did, payload.requestedCapabilities)) {
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

  /**
   * Re-send a certificate the Actor already holds, rather than minting a new one.
   *
   * Returns false when there is nothing usable to send — no active certificate,
   * or one that does not cover what was asked for — so the caller can fall
   * through to the normal request/approval path.
   *
   * **Nothing is minted and no exchange runs.** The certificate was signed once
   * and is verifiable offline; re-sending the same bytes is not a new grant, so
   * a reconnect costs a message rather than an admin's attention. The
   * alternative — a fresh Challenger round on every reconnect — would also
   * re-issue a certificate with a new id and a new expiry, quietly extending
   * every grant for as long as an Actor keeps restarting.
   *
   * Expiry and revocation are checked here rather than assumed from the row's
   * status: a certificate that expired while the Actor was offline must not be
   * re-delivered as though it were live, and `expiresAt` is the only thing that
   * knows that without waiting for a status refresh.
   */
  private async redeliverExistingCertificate(
    sender: AgentSender,
    did: string,
    requested?: string[]
  ): Promise<boolean> {
    const active = await CapabilityCertificateDAO.list({ agentDid: did, status: "active" });
    const registryNames = new Set(await CustomCapabilityDAO.listNames());
    const chosen = selectRedeliverableCertificate(active, registryNames, requested, Date.now());
    if (!chosen) return false;

    this.sendMessage(sender, "cert_issued", {
      certId: chosen.cert.id,
      certificate: chosen.cert.certificate,
      capabilities: chosen.capabilities,
    } satisfies CertIssuedPayload);
    logger.info({ did, certId: chosen.cert.id }, "Re-delivered an existing certificate on reconnect");
    return true;
  }

  /** Proactively prompts a connected Actor into a service:"certificate" exchange — same
   *  mechanics as handleRegister's opening auth_challenge, different purpose. */
  private startCertificateIssuance(
    sender: AgentSender,
    registrationId: string,
    capabilities: AgentCapability[]
  ): void {
    // Never restart an exchange already in flight on this connection. `certIssuance` is keyed by
    // sender and holds the session id the client is answering against, so overwriting it makes the
    // client's next `cert_challenge` arrive for a session that no longer exists — the exchange
    // fails and the grant is never delivered. Guarding here rather than in each caller because
    // there are now three (admin approval, reconnect, and the delivery sweep) and only the sweep
    // can fire repeatedly while one is pending.
    if (this.certIssuance.has(sender)) {
      logger.debug({ registrationId }, "Certificate exchange already in flight; not restarting it");
      return;
    }

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

      // A `proxy` Actor cannot enforce on what it just received here: a
      // challenger-format certificate carries no signed capability metadata, so
      // it proves live presence but not what was granted (§8.1). Follow up with
      // an actor_config push, which carries the packcert grant it can actually
      // re-verify offline — otherwise an admin would issue a certificate, see
      // "delivered", and have a proxy that still refuses everything.
      void this.pushActorConfig(registration.did);
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

    // Fail closed on a custom capability the registry no longer knows about
    // (docs/CUSTOM_CAPABILITIES.md). This is the *authoritative* propagation path for a
    // registry deletion: the row on the certificate is left untouched, but what we sign
    // here — and therefore what the holder keeps after its next refresh — omits the name.
    //
    // If the filter empties the list we still report the row's real `status`. "An active
    // certificate with nothing left on it" is the honest answer; collapsing it to `revoked`
    // would misreport the ledger, and the holder's own fail-closed handling of an empty
    // capability set is what actually stops it acting.
    const registryNames = new Set(await CustomCapabilityDAO.listNames());
    const effectiveCapabilities = filterAgainstRegistry(
      cert.capabilities as string[],
      registryNames
    );

    const serverVid = await ServerIdentityDAO.getServerVaultysId();
    const responseToken = await signCertStatusResponseCert(serverVid, {
      certId: cert.id,
      agentDid: cert.agentDid,
      status,
      capabilities: effectiveCapabilities,
      resourceLimits: cert.resourceLimits as never,
      scope: cert.scope as never,
      expiresAt: cert.expiresAt ? cert.expiresAt.getTime() : null,
    });

    this.statusCheckBuffer.push({
      certId: cert.id,
      requesterDid,
      status,
      // Recorded now rather than at flush time, so a batched write still says when the check
      // actually happened.
      checkedAt: new Date(),
    });

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

  /**
   * Push kind-specific configuration to a connected Actor
   * (docs/PROXY_ARCHITECTURE.md §12).
   *
   * Called on reconnect, and by admin code after changing a proxy's
   * `kindConfig`, issuing or revoking one of its certificates, or changing the
   * org trust settings. Safe to call for any DID: it is a no-op for an Actor
   * that is offline or of a kind with nothing to push.
   *
   * Returns whether a message was actually sent, so an admin action can report
   * "applied now" versus "will apply when the proxy reconnects" instead of
   * implying the former.
   *
   * Deliberately not throwing on a build failure. The recipient always holds a
   * previously *verified* config and keeps enforcing it, bounded by its own
   * staleness setting — so a failed push degrades to "unchanged", never to
   * "unenforced".
   */
  async pushActorConfig(did: string): Promise<boolean> {
    const actor = this.connected.get(did);
    if (!actor) return false;

    try {
      const result = await buildActorConfig(did);
      if (!result) return false;

      for (const warning of result.warnings) {
        // Warnings describe a proxy that will enforce less than its admin
        // expects — the state that looks identical to a working one, so it has
        // to be loud somewhere even when nobody is looking at the panel.
        logger.warn({ did, warning }, "Proxy configuration warning");
      }

      this.sendMessage(actor.sender, "actor_config", result.payload);
      logger.info(
        {
          did,
          hasGrant: result.payload.grantToken !== null,
          hasRuleSet: result.payload.ruleSetToken !== null,
          failClosed: result.payload.trust.failClosed,
        },
        "Pushed actor config"
      );
      return true;
    } catch (err) {
      logger.error({ did, err }, "Failed to build actor config; the agent keeps its last verified config");
      return false;
    }
  }

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

/**
 * Whether a reported capability manifest matches what is already stored.
 *
 * Compared field-by-field over a name-sorted copy rather than by `JSON.stringify` of the raw
 * values: key order and array order are both incidental to what the manifest *means*, and a
 * stringify would report a change whenever an SDK happened to emit its declarations in a different
 * order, reintroducing exactly the per-reconnect write this check exists to avoid.
 */
function sameDeclaredCapabilities(stored: unknown, reported: DeclaredCapability[]): boolean {
  if (!Array.isArray(stored)) return false;
  if (stored.length !== reported.length) return false;

  const key = (d: { name?: unknown }) => String(d?.name ?? "");
  const a = [...(stored as DeclaredCapability[])].sort((x, y) => key(x).localeCompare(key(y)));
  const b = [...reported].sort((x, y) => key(x).localeCompare(key(y)));

  return a.every((x, i) => {
    const y = b[i];
    return (
      x?.name === y?.name &&
      (x?.label ?? null) === (y?.label ?? null) &&
      (x?.description ?? null) === (y?.description ?? null)
    );
  });
}
