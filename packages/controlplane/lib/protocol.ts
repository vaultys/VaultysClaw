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
  | "error";

export interface ProtocolMessage {
  messageId: string;
  type: ProtocolMessageType;
  payload: unknown;
  timestamp: string; // ISO 8601
}

export interface RegisterPayload {
  name: string;
  /** Open-ended — "openclaw" | "mcp" | "sensor" | future kinds (§4.2). Not human; humans onboard via login, not this handshake. */
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
