import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePermission } from "../src/resolve-permission";
import type { AgentCapability } from "@vaultysclaw/policy";
import type { CapabilityCertificateLite, RequestedAction } from "../src/types";

/**
 * The TypeScript half of the shared TS/Go conformance suite
 * (docs/PROXY_ARCHITECTURE.md §3.3).
 *
 * `vaultysclaw-sensor/internal/authz` is a Go port of `resolvePermission`,
 * because the interception point enforces certificates on a host where no
 * Node runtime exists. Two implementations of an authorization function that
 * disagree are a vulnerability, so both read the *same* vector file and must
 * produce identical decisions — including the exact deny reason strings, which
 * `packages/policy/CLAUDE.md` already requires be kept stable.
 *
 * A failure here is never fixed by editing the vector. It means this
 * implementation and the Go one disagree about who may do what; find out which
 * is wrong first.
 *
 * The vector file deliberately lives outside both packages
 * (`conformance/permission-vectors.json` at the repo root): it is a contract
 * between two implementations, not a fixture belonging to either.
 */
const VECTORS_PATH = fileURLToPath(
  new URL("../../../conformance/permission-vectors.json", import.meta.url)
);

interface VectorCase {
  name: string;
  now: number;
  action: { capability: string; resource?: string };
  certs: Array<Record<string, unknown>>;
  expect: { allowed: boolean; grantingCertId?: string; reason?: string };
}

interface VectorFile {
  version: number;
  cases: VectorCase[];
}

const vectors = JSON.parse(readFileSync(VECTORS_PATH, "utf8")) as VectorFile;

describe("shared TS/Go conformance vectors", () => {
  // Guard against a broken path or truncated file quietly turning this into a
  // suite that passes because it asserts nothing.
  it("loads the shared vector file", () => {
    expect(vectors.version).toBe(1);
    expect(vectors.cases.length).toBeGreaterThan(0);
  });

  for (const testCase of vectors.cases) {
    it(testCase.name, () => {
      // The vector JSON is the wire shape of CapabilityCertificateLite /
      // RequestedAction by construction — casting rather than remapping is
      // deliberate, so a field the Go side reads and this side silently
      // ignores would show up as a decision mismatch instead of being
      // smoothed over by a translation layer here.
      const action = testCase.action as unknown as RequestedAction;
      const certs = testCase.certs as unknown as CapabilityCertificateLite[];

      const decision = resolvePermission(action, certs, testCase.now);

      expect(decision.allowed).toBe(testCase.expect.allowed);
      expect(decision.grantingCertId).toBe(testCase.expect.grantingCertId);
      expect(decision.reason).toBe(testCase.expect.reason);
    });
  }
});

describe("conformance vector coverage", () => {
  /**
   * The vectors are the contract, so they have to actually exercise the
   * dimensions that can diverge between two implementations. This asserts the
   * shape of the suite rather than any single decision — a future edit that
   * drops every scoped or every use-limited case would otherwise pass
   * unnoticed and leave the Go port unpinned on that dimension.
   */
  it("covers scope, expiry, status, use limits and pattern escaping", () => {
    const allCerts = vectors.cases.flatMap((c) => c.certs as Array<Record<string, any>>);

    expect(allCerts.some((c) => c.scope?.resource)).toBe(true);
    expect(allCerts.some((c) => c.scope?.resourcePattern?.includes("*"))).toBe(true);
    expect(allCerts.some((c) => c.scope?.maxUses !== undefined)).toBe(true);
    expect(allCerts.some((c) => c.expiresAt === null)).toBe(true);
    expect(allCerts.some((c) => typeof c.expiresAt === "number")).toBe(true);
    expect(allCerts.some((c) => c.status !== "active")).toBe(true);

    // A '.' in a pattern must stay literal in both languages — JS escapes it
    // by hand, Go via regexp.QuoteMeta. Without a case for it the two could
    // diverge on exactly the input that widens access.
    expect(
      allCerts.some((c) => /[.+?^${}()|[\]\\]/.test(c.scope?.resourcePattern ?? ""))
    ).toBe(true);

    // Both deny message forms, and both must appear.
    const reasons = vectors.cases.map((c) => c.expect.reason ?? "");
    expect(reasons.some((r) => r.includes("for resource"))).toBe(true);
    expect(reasons.some((r) => r.length > 0 && !r.includes("for resource"))).toBe(true);
  });

  it("uses only capabilities that exist in the AgentCapability catalog", () => {
    // Guards against a vector pinning behaviour for a capability that was
    // renamed or never existed — which would pass in both languages (both treat
    // the catalog as opaque strings) while testing nothing real.
    const known: AgentCapability[] = [
      "file_access",
      "internet_access",
      "browser_control",
      "api_call",
      "mail_send",
      "code_execution",
      "system_command",
      "agent_communication",
      "knowledge_search",
      "admin_console_access",
      "portal_access",
      "process_read",
      "non_delegatable",
      "delegation",
    ];

    const used = new Set<string>();
    for (const c of vectors.cases) {
      used.add(c.action.capability);
      for (const cert of c.certs as Array<{ capabilities?: string[] }>) {
        for (const cap of cert.capabilities ?? []) used.add(cap);
      }
    }

    expect([...used].filter((cap) => cap !== "" && !known.includes(cap as AgentCapability))).toEqual(
      []
    );
  });
});
