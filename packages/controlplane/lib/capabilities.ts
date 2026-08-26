import type { AgentCapability, BuiltinCapability } from "@vaultysclaw/policy";
import { CustomCapabilityDAO } from "@/db";

/** Built-in capabilities selectable when approving/issuing to an agent-kind Actor (openclaw/mcp).
 *  Sensors have their own much smaller set — see `SENSOR_CAPABILITIES` — not this list.
 *  Custom `vendor:action` capabilities are not here: they live in the registry
 *  (`CustomCapabilityDAO`) and are merged in by `grantableCapabilitiesForKind`. */
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
  "non_delegatable",
] as const satisfies readonly BuiltinCapability[];

/**
 * Sensors have no general capability model — just this one flag today,
 * gating whether `vaultysclaw-sensor`'s binary actually reads local process
 * info at all (`cmd/sensor/poll.go`), rather than collecting anything before
 * being granted it. More will be added here as the sensor grows independent
 * capabilities to gate (per the roadmap, not yet built).
 */
// Deliberately excludes "non_delegatable" — this list is kept to the one real capability so the
// registration-approval UI's "sensors only have this one capability today" copy stays true.
export const SENSOR_CAPABILITIES = ["process_read"] as const satisfies readonly BuiltinCapability[];

/** The **built-in** allow-list for a kind. `device` (see `lib/actor-kinds.ts`) falls into the
 *  `AGENT_CAPABILITIES` default below, same as openclaw/mcp — it has no smaller capability set of
 *  its own yet. Custom capabilities are handled separately; use
 *  {@link grantableCapabilitiesForKind} for the full set an admin may actually pick. */
export function allowedCapabilitiesForKind(kind: string): readonly BuiltinCapability[] {
  return kind === "sensor" ? SENSOR_CAPABILITIES : AGENT_CAPABILITIES;
}

/**
 * The complete set an admin may grant to this kind: its built-ins **plus every name currently in
 * the custom-capability registry** (docs/CUSTOM_CAPABILITIES.md).
 *
 * Custom names are deliberately **not** partitioned by kind. A `vendor:action` is meaningful to
 * whichever application binds an operation to it, and the control plane has no way to know which
 * kinds those are; a per-kind allow-list for admin-defined names would be a second registry to
 * keep in sync, with no security gain — the grant still has to be issued deliberately either way.
 *
 * This is the allow-list every issuance path filters against, so a name deleted from the registry
 * stops being grantable immediately, and a stale form post naming it grants nothing.
 */
export async function grantableCapabilitiesForKind(
  kind: string
): Promise<readonly AgentCapability[]> {
  const custom = await CustomCapabilityDAO.listNames();
  // The cast is sound because every write path into `CustomCapability.name` goes through
  // `parseCustomCapability`, which throws for anything not matching CUSTOM_CAPABILITY_RE — so a
  // row's name is always a well-formed `vendor:action`. TypeScript can't see that through the DB.
  return [...allowedCapabilitiesForKind(kind), ...(custom as AgentCapability[])];
}
