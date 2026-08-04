import type { AgentCapability } from "@vaultysclaw/policy";

/** Capabilities selectable when approving/issuing to an agent-kind Actor (openclaw/mcp). Sensors
 *  have their own much smaller set — see `SENSOR_CAPABILITIES` — not this list. */
export const AGENT_CAPABILITIES = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
  "agent_communication",
  "knowledge_search",
] as const satisfies readonly AgentCapability[];

/**
 * Sensors have no general capability model — just this one flag today,
 * gating whether `vaultysclaw-sensor`'s binary actually reads local process
 * info at all (`cmd/sensor/poll.go`), rather than collecting anything before
 * being granted it. More will be added here as the sensor grows independent
 * capabilities to gate (per the roadmap, not yet built).
 */
export const SENSOR_CAPABILITIES = ["process_read"] as const satisfies readonly AgentCapability[];

/** The allow-list a `PendingRegistration` approval is filtered against, by the registering
 *  Actor's `kind` — see `lib/registrations.ts`. Anything not in the matching list is dropped
 *  rather than granted, even if somehow submitted (e.g. a direct form post). */
export function allowedCapabilitiesForKind(kind: string): readonly AgentCapability[] {
  return kind === "sensor" ? SENSOR_CAPABILITIES : AGENT_CAPABILITIES;
}
