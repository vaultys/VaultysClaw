/**
 * The merge behind the srt settings builder.
 *
 * Extracted from the component because this is the half that can be silently
 * wrong: a builder that knows six keys and drops the rest would delete
 * `ignoreViolations`, `allowUnixSockets`, or whatever the next srt release adds,
 * the first time an admin edited an existing template through it. A React
 * component cannot be asserted on in this package's test setup; these can.
 */

/** The lists the builder models with real controls. */
export interface ManagedLists {
  denyRead: string[];
  allowRead: string[];
  allowWrite: string[];
  denyWrite: string[];
  deniedDomains: string[];
}

const EMPTY: ManagedLists = {
  denyRead: [],
  allowRead: [],
  allowWrite: [],
  denyWrite: [],
  deniedDomains: [],
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Split an srt block into the parts this component edits and everything else.
 *
 * The "everything else" is deliberately three-layered: unknown top-level keys,
 * unknown keys inside `filesystem`, and unknown keys inside `network`. A single
 * top-level bucket would lose `network.allowUnixSockets` while appearing to
 * preserve unknown settings, which is worse than not claiming to preserve them.
 */
export function splitSrtBlock(block: Record<string, unknown>): {
  lists: ManagedLists;
  extras: Record<string, unknown>;
  fsExtras: Record<string, unknown>;
  netExtras: Record<string, unknown>;
} {
  const fs = asObject(block.filesystem);
  const net = asObject(block.network);

  const { denyRead, allowRead, allowWrite, denyWrite, ...fsExtras } = fs;
  const { deniedDomains, ...netExtras } = net;
  const { filesystem: _fs, network: _net, ...extras } = block;

  return {
    lists: {
      denyRead: asStringArray(denyRead),
      allowRead: asStringArray(allowRead),
      allowWrite: asStringArray(allowWrite),
      denyWrite: asStringArray(denyWrite),
      deniedDomains: asStringArray(deniedDomains),
    },
    extras,
    fsExtras,
    netExtras,
  };
}

export function serializeSrtBlock(
  lists: ManagedLists,
  extras: Record<string, unknown>,
  fsExtras: Record<string, unknown>,
  netExtras: Record<string, unknown>
): string {
  const filesystem: Record<string, unknown> = {
    ...fsExtras,
    denyRead: lists.denyRead,
    allowRead: lists.allowRead,
    allowWrite: lists.allowWrite,
    denyWrite: lists.denyWrite,
  };
  const network: Record<string, unknown> = { ...netExtras, deniedDomains: lists.deniedDomains };

  const everythingEmpty =
    Object.values(lists).every((l) => l.length === 0) &&
    Object.keys(extras).length === 0 &&
    Object.keys(fsExtras).length === 0 &&
    Object.keys(netExtras).length === 0;
  // An untouched builder must submit nothing at all, so a certificate issued
  // without confinement carries no srt block rather than an empty scaffold.
  if (everythingEmpty) return "";

  return JSON.stringify({ ...extras, filesystem, network }, null, 2);
}
