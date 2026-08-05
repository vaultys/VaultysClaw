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
  badgeClass: string;
}

export const ACTOR_KIND_META: Record<string, ActorKindMeta> = {
  human: {
    label: "human",
    category: "human",
    badgeClass: "bg-success-100 text-success-700 border-success-200",
  },
  openclaw: {
    label: "openclaw",
    category: "agent",
    badgeClass: "bg-primary-100 text-primary-700 border-primary-200",
  },
  mcp: {
    label: "mcp",
    category: "agent",
    badgeClass: "bg-secondary-100 text-secondary-700 border-secondary-200",
  },
  sensor: {
    label: "sensor",
    category: "agent",
    badgeClass: "bg-neutral-100 text-foreground-600 border-neutral-200",
  },
  device: {
    label: "device",
    category: "agent",
    badgeClass: "bg-warning-100 text-warning-700 border-warning-200",
  },
};

const DEFAULT_BADGE_CLASS = "bg-neutral-100 text-foreground-600 border-neutral-200";

/** Falls back gracefully for a kind string not in the registry yet — open-ended by design
 *  (docs §4.3), so an unrecognized kind still renders instead of crashing. */
export function getActorKindMeta(kind: string): ActorKindMeta {
  return ACTOR_KIND_META[kind] ?? { label: kind, category: "agent", badgeClass: DEFAULT_BADGE_CLASS };
}

export function categoryForKind(kind: string): ActorCategory {
  return getActorKindMeta(kind).category;
}
