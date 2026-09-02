/**
 * What a simulated Actor *does* once it is connected.
 *
 * The point of the simulator is not to open sockets — it is to put the control plane under the
 * shape of traffic a real fleet produces, so each kind behaves the way that kind actually behaves.
 * A sensor is chatty and stateless; a device is mostly idle and reconnects on a flaky link; an
 * agent asks for capabilities and re-checks them. Modelling that costs almost nothing here and is
 * the difference between load-testing the WebSocket accept path and exercising the system.
 */

import type { AgentCapability } from "@vaultysclaw/policy";

/** Which `kind` an Actor registers as. Open-ended in the protocol; these are the ones that exist. */
export type SimKind = "openclaw" | "mcp" | "sensor" | "device" | "proxy";

export interface Persona {
  kind: SimKind;
  /** What this kind asks for at registration. An admin may approve less — that is the point. */
  requestedCapabilities: AgentCapability[];
  /**
   * How often this Actor re-checks its certificate status, in ms, or `null` to leave it to the
   * runtime's own schedule (derived from `trust.maxStatusAgeSeconds`). An explicit value here
   * simulates a client that is more paranoid than the org requires.
   */
  statusRefreshMs: number | null;
  /** How often a sensor-kind Actor reports telemetry. Ignored for other kinds. */
  telemetryMs: number | null;
  /**
   * Probability per minute that this Actor drops its connection and reconnects.
   *
   * Churn is deliberately modelled: a fleet where nothing ever disconnects never exercises the
   * reconnect path, which is exactly where re-delivery of approved grants and re-verification of
   * status live — the parts most likely to be broken.
   */
  churnPerMinute: number;
}

export const PERSONAS: Record<SimKind, Persona> = {
  // A coding agent: wants broad capability, long-lived connection, re-checks on the org's schedule.
  openclaw: {
    kind: "openclaw",
    requestedCapabilities: ["file_access", "code_execution", "internet_access", "knowledge_search"],
    statusRefreshMs: null,
    telemetryMs: null,
    churnPerMinute: 0.02,
  },
  // An MCP server: narrower, and more likely to be restarted by whatever supervises it.
  mcp: {
    kind: "mcp",
    requestedCapabilities: ["api_call", "knowledge_search"],
    statusRefreshMs: null,
    telemetryMs: null,
    churnPerMinute: 0.05,
  },
  // A workload sensor: one capability, and the only kind that pushes data on a timer.
  sensor: {
    kind: "sensor",
    requestedCapabilities: ["process_read"],
    statusRefreshMs: null,
    telemetryMs: 30_000,
    churnPerMinute: 0.01,
  },
  // A laptop or phone: idle most of the time, on a network that comes and goes.
  device: {
    kind: "device",
    requestedCapabilities: ["file_access"],
    statusRefreshMs: null,
    telemetryMs: null,
    churnPerMinute: 0.25,
  },
  // An interception point: enforces offline, so it re-checks aggressively and never churns
  // voluntarily — it is infrastructure.
  proxy: {
    kind: "proxy",
    requestedCapabilities: ["internet_access", "api_call"],
    statusRefreshMs: 60_000,
    telemetryMs: null,
    churnPerMinute: 0.0,
  },
};

/**
 * The default fleet composition, as weights.
 *
 * "Agents" (`openclaw` + `mcp`) are the things doing work; everything else is the estate they run
 * on. The mix matters for realism: a control plane whose load is 90% sensor telemetry behaves very
 * differently from one whose load is agent capability checks.
 */
export const AGENT_KINDS: SimKind[] = ["openclaw", "mcp"];
export const ESTATE_KINDS: SimKind[] = ["sensor", "device", "proxy"];

export const AGENT_MIX: Record<string, number> = { openclaw: 0.7, mcp: 0.3 };
export const ESTATE_MIX: Record<string, number> = { sensor: 0.55, device: 0.4, proxy: 0.05 };

/** Deterministically expand a weighted mix into exactly `total` kinds, largest-remainder style. */
export function expandMix(mix: Record<string, number>, total: number): SimKind[] {
  const entries = Object.entries(mix);
  const exact = entries.map(([kind, w]) => ({ kind: kind as SimKind, want: w * total }));
  const out: SimKind[] = [];
  for (const e of exact) out.push(...Array<SimKind>(Math.floor(e.want)).fill(e.kind));
  // Hand out the remainder to the largest fractional parts, so the total is exact rather than
  // "about right" — an off-by-a-few fleet makes every count in the report suspect.
  const remainders = exact
    .map((e) => ({ kind: e.kind, frac: e.want - Math.floor(e.want) }))
    .sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (out.length < total && remainders.length > 0) {
    out.push(remainders[i % remainders.length].kind);
    i++;
  }
  return out.slice(0, total);
}
