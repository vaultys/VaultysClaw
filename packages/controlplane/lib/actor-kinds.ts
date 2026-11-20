/**
 * Single source of truth for Actor kind metadata — replaces four previously
 * byte-identical `KIND_BADGE` object literals (Actors list/detail, Workspace
 * detail, Audit Log) plus keeps `components/map/world-map/types.ts`'s parallel
 * hex-color/icon maps honest (add a kind here, then there — see that file's
 * own cross-reference comment).
 *
 * `category` is the human/non-human split: "human" is the one kind onboarded
 * via login rather than the WS registration handshake (`lib/protocol.ts`);
 * everything else — including `device`, a browser/computer/server that may
 * belong to (and, once real certificate delegation exists, act for) another
 * Actor via `Actor.ownerDid` — is "agent".
 */
export type ActorCategory = "human" | "agent";

export interface ActorKindMeta {
  label: string;
  category: ActorCategory;
  /** True for the kinds that can refuse work rather than only report — their badge carries a
   *  red dot. Every other kind renders as a plain neutral badge. */
  enforces: boolean;
}

export const ACTOR_KIND_META: Record<string, ActorKindMeta> = {
  human: {
    label: "human",
    category: "human",
    enforces: false,
  },
  openclaw: {
    label: "openclaw",
    category: "agent",
    enforces: false,
  },
  mcp: {
    label: "mcp",
    category: "agent",
    enforces: false,
  },
  sensor: {
    label: "sensor",
    category: "agent",
    enforces: false,
  },
  device: {
    label: "device",
    category: "agent",
    enforces: false,
  },
  // An interception point running the intercept role — a CONNECT proxy that
  // refuses agent traffic its certificate does not authorize
  // (docs/PROXY_ARCHITECTURE.md §2). Unlike every other kind here it *enforces*
  // rather than only reports, which is why its detail page has to state the
  // zone semantics of §4.2 explicitly: a proxy governs everything pointed at
  // it, so two agents behind one proxy are indistinguishable to the decision.
  //
  // Marked (a red dot on its badge) on purpose. The same binary in observe-only mode registers
  // as `sensor`; this badge means traffic is being refused somewhere.
  proxy: {
    label: "proxy",
    category: "agent",
    enforces: true,
  },
  // The same binary running the *supervise* role: it launches a coding harness
  // (Claude Code today) and decides every tool call from a signed grant and rule
  // set (docs/HARNESS_SUPERVISOR.md).
  //
  // Marked for the same reason `proxy` is — this kind can refuse work —
  // and note it can be refusing on a *human's* laptop, which is a different blast
  // radius from a server-side proxy and one the detail page has to state.
  harness: {
    label: "harness",
    category: "agent",
    enforces: true,
  },
};

/** Falls back gracefully for a kind string not in the registry yet — open-ended by design
 *  (docs §4.3), so an unrecognized kind still renders instead of crashing. */
export function getActorKindMeta(kind: string): ActorKindMeta {
  return ACTOR_KIND_META[kind] ?? { label: kind, category: "agent", enforces: false };
}

export function categoryForKind(kind: string): ActorCategory {
  return getActorKindMeta(kind).category;
}

/**
 * The longest `kind` the registration handshake will accept.
 *
 * `Actor.kind` is an unbounded text column and a client picks its own value, so without a cap an
 * unauthenticated socket can write an arbitrarily large string to it on every connection attempt.
 * 64 is far above every kind above and every plausible future one, so this bounds the abuse
 * without narrowing the open-endedness §4.3 is deliberate about.
 */
export const MAX_KIND_LENGTH = 64;

/**
 * Whether a client may register itself under this `kind`.
 *
 * **`kind` arrives from the client, unauthenticated**, in the `register` frame that opens the
 * handshake (`lib/protocol.ts`'s `RegisterPayload`) — it is an assertion, not a fact the control
 * plane established. `lib/protocol.ts` has always documented "Not human; humans onboard via login,
 * not this handshake", and this is what enforces it. Two things hang on that boundary:
 *
 * 1. **Kill switches.** `lib/kill-switch.ts`'s `suppressionFor` exempts `kind: "human"`
 *    unconditionally, and must — `admin_console_access` is itself a certificate capability, so a
 *    switch that covered humans would lock every admin out of the only UI that can disarm it. An
 *    Actor that can name its own kind can therefore name itself permanently un-suspendable, which
 *    is the one control an incident depends on.
 * 2. **The capability allow-list.** `lib/capabilities.ts` offers `HUMAN_CAPABILITIES` — including
 *    `admin_console_access` — for a human-kind Actor, and `AGENT_CAPABILITIES` (which has neither
 *    console right in it) for everything else.
 *
 * Unknown kinds stay allowed: `getActorKindMeta` categorises anything not in the registry as an
 * agent, so a kind added by a newer client than this control plane still registers. Only the
 * human category is refused, which is the boundary that carries the two consequences above.
 */
export function isRegisterableKind(kind: string): boolean {
  if (!kind || kind.length > MAX_KIND_LENGTH) return false;
  return categoryForKind(kind) !== "human";
}
