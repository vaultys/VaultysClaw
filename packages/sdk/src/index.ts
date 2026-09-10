export { ActorRuntime } from "./actor-runtime.js";
export type {
  ActorRuntimeConfig,
  ActorRuntimeEvents,
  ActorStatus,
  CapabilityChange,
} from "./actor-runtime.js";

export { loadOrCreateIdentity, expandHome } from "./identity.js";
export { Handshake, HandshakeError } from "./handshake.js";
export type { HandshakeService } from "./handshake.js";
export { loadCapabilityState, saveCapabilityState } from "./cap-state.js";
export type { CapabilityState } from "./cap-state.js";

export {
  loadCapabilityManifest,
  parseCapabilityManifest,
  EMPTY_MANIFEST,
} from "./capability-manifest.js";
export type { CapabilityManifest, DeclaredCapability } from "./capability-manifest.js";

export { envelope } from "./protocol.js";
export type {
  ProtocolMessage,
  ProtocolMessageType,
  RegisterPayload,
  AuthChallengePayload,
  AuthCompletePayload,
  AuthFailedPayload,
  RegistrationPendingPayload,
  CapabilityRequestPayload,
  CertChallengePayload,
  CertIssuedPayload,
  CertFailedPayload,
  CapabilitiesChangedPayload,
  CapabilityRegistryChangedPayload,
  CertStatusRequestPayload,
  CertStatusResponsePayload,
  ActorConfigPayload,
  ErrorPayload,
} from "./protocol.js";

// Re-exported so a consumer can type an action and read a decision without
// taking a direct dependency on the trust package.
export type {
  RequestedAction,
  PermissionDecision,
  CapabilityCertificateLite,
} from "@vaultysclaw/trust";
export type { AgentCapability, CertificateStatus } from "@vaultysclaw/policy";
// The name grammar, re-exported so a host can validate a capability name it builds itself
// (a config value, a plugin id) with the same rule the control plane and sdk-go apply.
export { assertValidCapabilityName, isCustomCapability } from "@vaultysclaw/policy";
