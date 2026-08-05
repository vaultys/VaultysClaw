/**
 * The connection protocol — deliberately smaller than
 * `@vaultysclaw/shared`'s `WSMessageType` union, which carries chat/workflow/
 * channel message types this rebuild cuts (docs/REBUILD_ARCHITECTURE.md §2).
 * This is the kind-agnostic core: identity, registration, and the
 * certificate/status protocol from docs/CERTIFICATE_WEB_OF_TRUST.md — nothing
 * kind-specific lives here (see §4.3's kind extensions).
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
  // The interactive issuance flow (trust doc §3.2b): a connected Actor
  // asks for capabilities with a plain message; once an admin approves, the
  // control plane proactively runs a service:"certificate" Challenger
  // exchange (cert_challenge, mirroring auth_challenge's mechanics exactly)
  // and delivers the result.
  | "capability_request"
  | "cert_challenge"
  | "cert_issued"
  | "cert_failed"
  // A kind:"sensor" Actor's classified AI/agent process observations
  // (vaultysclaw-sensor/docs/vaultysclaw-integration.md §3) — the one
  // kind-specific message type in this file, because "report telemetry" has
  // no equivalent in the kind-agnostic core and doesn't warrant inventing
  // one just to avoid a single exception.
  | "sensor_telemetry"
  | "error";

export interface ProtocolMessage {
  messageId: string;
  type: ProtocolMessageType;
  payload: unknown;
  timestamp: string; // ISO 8601
}

export interface RegisterPayload {
  name: string;
  /** Open-ended — "openclaw" | "mcp" | "sensor" | "device" | future kinds (§4.2, lib/actor-kinds.ts). Not human; humans onboard via login, not this handshake. */
  kind: string;
}

export interface AuthChallengePayload {
  sessionId: string;
  /** Base64-encoded Challenger certificate bytes, or "" for the server's opening message. */
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

/** Both cert-status payloads carry the signed token as-is — the server/requester decode it themselves. */
export interface CertStatusRequestPayload {
  certToken: string;
}

export interface CertStatusResponsePayload {
  certToken: string;
}

export interface ErrorPayload {
  reason: string;
}

/**
 * A plain, unsigned request — no signature needed since it only ever arrives
 * over an already-authenticated connection (trust doc §3.2b). Sent either
 * right after a fresh registration (while the connection is in the
 * "awaiting approval" phase) or by an already-connected, known Actor
 * asking for more.
 */
export interface CapabilityRequestPayload {
  requestedCapabilities: string[];
}

/** Mirrors AuthChallengePayload exactly — same mechanics, service:"certificate" instead of "auth". */
export interface CertChallengePayload {
  sessionId: string;
  data: string;
}

export interface CertIssuedPayload {
  certId: string;
  /** Base64 Challenger certificate bytes — the agent's own copy of what was just issued. */
  certificate: string;
  /**
   * The capabilities actually granted — a plain field, not read back out of the certificate's own
   * signed metadata. `github.com/vaultys/vaultysid/go`'s Challenger (vaultysclaw-sensor's client)
   * has a verification bug: `Step2`/`Finalize` reconstruct the "unsigned challenge" they check a
   * peer's signature against with metadata hardcoded to empty, instead of the metadata that was
   * actually received — any certificate whose signed metadata is non-empty fails Go-side
   * verification with "invalid signature", even though the TS side (both signing it and
   * independently re-verifying it later, e.g. the certificate detail page) is completely correct.
   * Rather than depending on every Challenger implementation handling metadata identically, the
   * certificate itself carries no metadata for this exchange — it proves mutual live presence only,
   * not *what* was granted; this field is the actual, load-bearing answer to that question.
   */
  capabilities: string[];
}

export interface CertFailedPayload {
  reason: string;
}

/** Mirrors vaultysclaw-sensor's `internal/telemetry.Event`/`Workload`/`Device`/`ProcessInfo`
 *  structs field-for-field (JSON tag names) — see that repo for the authoritative shape. */
export interface SensorTelemetryEvent {
  schemaVersion: number;
  type: string;
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
    identityEvidence?: string;
  };
}

export interface SensorTelemetryPayload {
  events: SensorTelemetryEvent[];
}
