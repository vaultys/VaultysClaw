import { describe, it, expect } from "vitest";
import { ACTOR_KIND_META, MAX_KIND_LENGTH, categoryForKind, isRegisterableKind } from "@/lib/actor-kinds";
import { allowedCapabilitiesForKind } from "@/lib/capabilities";
import { suppressionForActor, type KillSwitchState } from "@/lib/kill-switch";
import type { KillSwitch } from "@prisma/client";

const globalArmed: KillSwitchState = {
  global: {
    id: "global",
    scopeType: "global",
    workspaceId: null,
    reason: "incident",
    armedBy: "did:vaultys:admin",
    armedAt: new Date("2026-07-17T10:00:00.000Z"),
  } as KillSwitch,
  byWorkspace: new Map(),
};

describe("isRegisterableKind", () => {
  it("refuses the human kind", () => {
    expect(isRegisterableKind("human")).toBe(false);
  });

  it("accepts every non-human kind in the registry", () => {
    for (const [kind, meta] of Object.entries(ACTOR_KIND_META)) {
      if (meta.category === "human") continue;
      expect(isRegisterableKind(kind), kind).toBe(true);
    }
  });

  it("accepts a kind newer than this control plane's registry", () => {
    // Kinds are open-ended by design (docs §4.3) — refusing an unrecognized one would mean a
    // newer client cannot register at all, which is not what this check is for.
    expect(categoryForKind("some-future-harness")).toBe("agent");
    expect(isRegisterableKind("some-future-harness")).toBe(true);
  });

  it("refuses an empty or over-long kind", () => {
    expect(isRegisterableKind("")).toBe(false);
    expect(isRegisterableKind("a".repeat(MAX_KIND_LENGTH))).toBe(true);
    expect(isRegisterableKind("a".repeat(MAX_KIND_LENGTH + 1))).toBe(false);
  });
});

describe("what a self-declared human kind would have bought", () => {
  // These two assertions are the reason the check above exists — they are the behaviour a client
  // that could name its own kind would have been buying, not incidental facts about humans. If
  // either ever stops holding, `isRegisterableKind`'s human case can be revisited; while they
  // hold, `kind` must never be taken from an unauthenticated frame.
  it("permanent kill-switch exemption", () => {
    expect(suppressionForActor({ kind: "human", workspaceId: null }, globalArmed)).toBeNull();
    expect(suppressionForActor({ kind: "openclaw", workspaceId: null }, globalArmed)).not.toBeNull();
  });

  it("an allow-list containing admin_console_access", () => {
    expect(allowedCapabilitiesForKind("human")).toContain("admin_console_access");
    expect(allowedCapabilitiesForKind("openclaw")).not.toContain("admin_console_access");
    expect(allowedCapabilitiesForKind("some-future-harness")).not.toContain("admin_console_access");
  });
});
