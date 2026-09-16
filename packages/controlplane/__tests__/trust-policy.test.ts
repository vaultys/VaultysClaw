import { describe, it, expect } from "vitest";
import {
  composeTrustPolicy,
  type OrgTrustDefaults,
  type WorkspaceTrustOverride,
} from "@/lib/trust-policy";

const strictOrg: OrgTrustDefaults = { failMode: "closed", stapleTtlSeconds: 0 };
const looseOrg: OrgTrustDefaults = { failMode: "open", stapleTtlSeconds: 600 };

const override = (over: Partial<WorkspaceTrustOverride> = {}): WorkspaceTrustOverride => ({
  certFailMode: null,
  certStapleTtlSeconds: null,
  ...over,
});

describe("composeTrustPolicy — inheritance", () => {
  it("uses the org values for an Actor in no workspace", () => {
    expect(composeTrustPolicy(looseOrg, null)).toEqual({
      failClosed: false,
      stapleTtlSeconds: 600,
      source: { failMode: "org", stapleTtl: "org" },
    });
  });

  it("uses the org values for a workspace that overrides nothing", () => {
    expect(composeTrustPolicy(looseOrg, override())).toEqual({
      failClosed: false,
      stapleTtlSeconds: 600,
      source: { failMode: "org", stapleTtl: "org" },
    });
  });

  it("inherits each field independently", () => {
    // The case an all-or-nothing override would make unexpressible: pin the fail
    // mode, keep following the org on staleness.
    const pinnedFailMode = composeTrustPolicy(looseOrg, override({ certFailMode: "closed" }));
    expect(pinnedFailMode).toEqual({
      failClosed: true,
      stapleTtlSeconds: 600,
      source: { failMode: "workspace", stapleTtl: "org" },
    });

    const pinnedTtl = composeTrustPolicy(looseOrg, override({ certStapleTtlSeconds: 30 }));
    expect(pinnedTtl).toEqual({
      failClosed: false,
      stapleTtlSeconds: 30,
      source: { failMode: "org", stapleTtl: "workspace" },
    });
  });
});

describe("composeTrustPolicy — precedence", () => {
  it("lets the workspace win over the org, in both directions", () => {
    // Deliberately the opposite of the kill switch, where an armed global switch
    // short-circuits the workspace (lib/kill-switch.ts). This is configuration, so
    // the most specific scope wins — including when that is the *looser* one.
    expect(
      composeTrustPolicy(strictOrg, override({ certFailMode: "open", certStapleTtlSeconds: 900 }))
    ).toEqual({
      failClosed: false,
      stapleTtlSeconds: 900,
      source: { failMode: "workspace", stapleTtl: "workspace" },
    });

    expect(
      composeTrustPolicy(looseOrg, override({ certFailMode: "closed", certStapleTtlSeconds: 0 }))
    ).toEqual({
      failClosed: true,
      stapleTtlSeconds: 0,
      source: { failMode: "workspace", stapleTtl: "workspace" },
    });
  });

  it("treats a stored 0 as an override, not as 'unset'", () => {
    // 0 is the strictest staple TTL there is — force a live query every time. Any
    // falsy-based check here would silently hand this workspace the org's 600s.
    const resolved = composeTrustPolicy(looseOrg, override({ certStapleTtlSeconds: 0 }));
    expect(resolved.stapleTtlSeconds).toBe(0);
    expect(resolved.source.stapleTtl).toBe("workspace");
  });

  it("keeps a negative staple TTL, which means unbounded", () => {
    const resolved = composeTrustPolicy(strictOrg, override({ certStapleTtlSeconds: -1 }));
    expect(resolved.stapleTtlSeconds).toBe(-1);
    expect(resolved.source.stapleTtl).toBe("workspace");
  });
});

describe("composeTrustPolicy — fail mode parsing", () => {
  it("resolves anything that is not 'open' to fail-closed", () => {
    // A typo written straight into the database must not be able to turn
    // enforcement off; only the exact string "open" opens the gate.
    for (const raw of ["closed", "CLOSED", "Open", "yes", ""]) {
      expect(composeTrustPolicy(looseOrg, override({ certFailMode: raw })).failClosed).toBe(true);
    }
    expect(composeTrustPolicy(strictOrg, override({ certFailMode: "open" })).failClosed).toBe(false);
  });

  it("still reports an unparseable override as coming from the workspace", () => {
    // It did override — it just resolved to the safe value. Reporting "org" here
    // would tell an admin the field was inherited and hide the bad row.
    expect(composeTrustPolicy(looseOrg, override({ certFailMode: "nonsense" })).source.failMode).toBe(
      "workspace"
    );
  });
});
