/**
 * The connection protocol, client side.
 *
 * A deliberate mirror of `packages/controlplane/lib/protocol.ts` rather than an
 * import: an SDK consumer must not have to depend on the control plane package
 * (which pulls Next.js, Prisma, and a database client) just to know the shape of
 * a WebSocket message. The two files are small and change together; if they ever
 * disagree, `controlplane` is authoritative.
 *
 * Note this is NOT `@vaultysclaw/shared`'s `WSMessageType`, which still carries
 * the chat/workflow/channel types the rebuilt control plane cuts.
 */

export type ProtocolMessageType =
  | "register"
  | "auth_challenge"
  | "auth_complete"
  | "auth_failed"
  | "registration_pending"
  | "heartbeat"
  | "pong"
  | "cert_status_request"
  | "cert_status_response"
  | "capability_request"
  | "cert_challenge"
  | "cert_issued"
  | "cert_failed"
  | "sensor_telemetry"
  | "actor_config"
  | "error";

export interface ProtocolMessage<P = unknown> {
  messageId: string;
  type: ProtocolMessageType;
  payload: P;
  /** ISO 8601. */
  timestamp: string;
}

/**
 * What the client declares before the handshake starts.
 *
 * Carries **no DID and no public key** — both are derived from the completed
 * Challenger exchange instead, so a client cannot assert an identity it does not
 * hold the key for. `name` is a display label; `kind` decides which capability
 * allow-list an approval is filtered against.
 */
export interface RegisterPayload {
  name: string;
  version?: string;
  /** "openclaw" | "mcp" | "sensor" | "device" | "proxy" | future kinds. Server defaults to "openclaw". */
  kind: string;
}

/** One round of a Challenger exchange. `data` is "" for the server's opening message. */
export interface AuthChallengePayload {
  sessionId: string;
  data: string;
}

export interface AuthCompletePayload {
  did: string;
}

export interface AuthFailedPayload {
  reason: string;
}

export interface RegistrationPendingPayload {
  registrationId: string;
  message: string;
}

/**
 * A plain, unsigned request. No signature is needed because it only ever travels
 * over an already-authenticated connection — the `auth` exchange proved identity,
 * and this message only has to arrive over that channel.
 */
export interface CapabilityRequestPayload {
  requestedCapabilities: string[];
}

/** Mirrors AuthChallengePayload exactly — same mechanics, service "certificate" instead of "auth". */
export interface CertChallengePayload {
  sessionId: string;
  data: string;
}

export interface CertIssuedPayload {
  certId: string;
  certificate: string;
  /**
   * The granted capabilities, as a plain unsigned field.
   *
   * Read them from here and **never** from the certificate's metadata: the Go
   * Challenger implementation reconstructs signed metadata as empty during
   * `Step2`/`Finalize`, so any certificate carrying non-empty metadata fails
   * Go-side re-verification. The certificate remains the authoritative artefact
   * proving both parties were live; this field is the convenience copy.
   */
  capabilities: string[];
}

export interface CertFailedPayload {
  reason: string;
}

/** Both cert-status payloads carry the signed token as-is — each side decodes it itself. */
export interface CertStatusRequestPayload {
  certToken: string;
}

export interface CertStatusResponsePayload {
  certToken: string;
}

/**
 * Kind-specific configuration, pushed on connect and whenever the Actor's
 * config, certificates, or the org trust policy change.
 *
 * The two `*Token` fields are signed by the control plane and meant to be
 * verified offline by the recipient, so the transport carrying them never has to
 * be trusted.
 */
export interface ActorConfigPayload {
  kindConfig: unknown;
  grantToken: string | null;
  ruleSetToken: string | null;
  trust: {
    failClosed: boolean;
    /**
     * How stale a cached status may be before a decision is refused.
     *
     * `0` is the **strictest** value — no cached status is acceptable, which for
     * an offline decider means denying everything. Unbounded must be written
     * explicitly as a negative, so it can never be reached by omission.
     */
    maxStatusAgeSeconds: number;
  };
}

export interface ErrorPayload {
  reason: string;
}

let counter = 0;

/** Envelope a payload for sending. */
export function envelope<P>(type: ProtocolMessageType, payload: P): ProtocolMessage<P> {
  counter += 1;
  return {
    messageId: `${Date.now().toString(36)}-${counter.toString(36)}`,
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}
