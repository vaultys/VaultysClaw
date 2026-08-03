import { describe, expect, it } from "vitest";
import { resolvePermission } from "../src/resolve-permission";
import type { CapabilityCertificateLite } from "../src/types";

const NOW = 1_000_000;

function cert(overrides: Partial<CapabilityCertificateLite> = {}): CapabilityCertificateLite {
  return {
    id: "cert-1",
    agentDid: "did:vaultys:agent",
    capabilities: ["file_access"],
    status: "active",
    issuedAt: NOW - 1000,
    expiresAt: NOW + 1000,
    ...overrides,
  };
}

describe("resolvePermission", () => {
  it("denies when no certificates are held", () => {
    const decision = resolvePermission({ capability: "file_access" }, [], NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/No active certificate/);
  });

  it("allows a standing certificate that grants the requested capability", () => {
    const decision = resolvePermission({ capability: "file_access" }, [cert()], NOW);
    expect(decision).toEqual({ allowed: true, grantingCertId: "cert-1" });
  });

  it("denies when no held certificate grants the requested capability", () => {
    const decision = resolvePermission(
      { capability: "internet_access" },
      [cert({ capabilities: ["file_access"] })],
      NOW
    );
    expect(decision.allowed).toBe(false);
  });

  it("excludes an expired certificate", () => {
    const decision = resolvePermission(
      { capability: "file_access" },
      [cert({ expiresAt: NOW - 1 })],
      NOW
    );
    expect(decision.allowed).toBe(false);
  });

  it("excludes a revoked certificate", () => {
    const decision = resolvePermission(
      { capability: "file_access" },
      [cert({ status: "revoked" })],
      NOW
    );
    expect(decision.allowed).toBe(false);
  });

  it("excludes a superseded certificate", () => {
    const decision = resolvePermission(
      { capability: "file_access" },
      [cert({ status: "superseded" })],
      NOW
    );
    expect(decision.allowed).toBe(false);
  });

  it("treats expiresAt: null as never expiring", () => {
    const decision = resolvePermission(
      { capability: "file_access" },
      [cert({ expiresAt: null, issuedAt: NOW - 1_000_000_000 })],
      NOW
    );
    expect(decision.allowed).toBe(true);
  });

  describe("attribute scoping", () => {
    it("allows a scoped certificate when the exact resource matches", () => {
      const decision = resolvePermission(
        { capability: "file_access", resource: "file:///reports/q3.pdf" },
        [cert({ scope: { resource: "file:///reports/q3.pdf" } })],
        NOW
      );
      expect(decision.allowed).toBe(true);
    });

    it("denies a scoped certificate when the resource does not match", () => {
      const decision = resolvePermission(
        { capability: "file_access", resource: "file:///reports/other.pdf" },
        [cert({ scope: { resource: "file:///reports/q3.pdf" } })],
        NOW
      );
      expect(decision.allowed).toBe(false);
    });

    it("denies a scoped certificate when the action has no resource to check", () => {
      const decision = resolvePermission(
        { capability: "file_access" },
        [cert({ scope: { resource: "file:///reports/q3.pdf" } })],
        NOW
      );
      expect(decision.allowed).toBe(false);
    });

    it("allows a resourcePattern glob match", () => {
      const decision = resolvePermission(
        { capability: "file_access", resource: "file:///reports/q3.pdf" },
        [cert({ scope: { resourcePattern: "file:///reports/*" } })],
        NOW
      );
      expect(decision.allowed).toBe(true);
    });

    it("denies a resourcePattern glob that does not match", () => {
      const decision = resolvePermission(
        { capability: "file_access", resource: "file:///invoices/q3.pdf" },
        [cert({ scope: { resourcePattern: "file:///reports/*" } })],
        NOW
      );
      expect(decision.allowed).toBe(false);
    });

    it("exhausts maxUses", () => {
      const scoped = cert({ scope: { resource: "file:///x", maxUses: 1 }, usedCount: 1 });
      const decision = resolvePermission(
        { capability: "file_access", resource: "file:///x" },
        [scoped],
        NOW
      );
      expect(decision.allowed).toBe(false);
    });

    it("allows a maxUses grant that has not yet been exhausted", () => {
      const scoped = cert({ scope: { resource: "file:///x", maxUses: 3 }, usedCount: 2 });
      const decision = resolvePermission(
        { capability: "file_access", resource: "file:///x" },
        [scoped],
        NOW
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe("multiple concurrent certificates (union, not replacement)", () => {
    it("falls through a non-matching scoped cert to a matching standing cert", () => {
      const scoped = cert({
        id: "cert-scoped",
        scope: { resource: "file:///reports/q3.pdf" },
      });
      const standing = cert({ id: "cert-standing", scope: undefined });
      const decision = resolvePermission(
        { capability: "file_access", resource: "file:///invoices/x.pdf" },
        [scoped, standing],
        NOW
      );
      expect(decision).toEqual({ allowed: true, grantingCertId: "cert-standing" });
    });

    it("grants via the scoped cert when its resource matches, ignoring an unrelated standing cert", () => {
      const scoped = cert({
        id: "cert-scoped",
        capabilities: ["internet_access"],
        scope: { resource: "domain:api.example.com" },
      });
      const standing = cert({ id: "cert-standing", capabilities: ["file_access"] });
      const decision = resolvePermission(
        { capability: "internet_access", resource: "domain:api.example.com" },
        [scoped, standing],
        NOW
      );
      expect(decision.grantingCertId).toBe("cert-scoped");
    });
  });

  describe("security invariants", () => {
    it("revoking a certificate never grants more access than the remaining set already had", () => {
      const a = cert({ id: "a", capabilities: ["file_access"] });
      const b = cert({ id: "b", capabilities: ["internet_access"] });

      const before = resolvePermission({ capability: "internet_access" }, [a, b], NOW);
      expect(before.allowed).toBe(true);

      const revokedA = { ...a, status: "revoked" as const };
      const after = resolvePermission({ capability: "internet_access" }, [revokedA, b], NOW);

      // Revoking `a` (which never granted internet_access) must not change this decision.
      expect(after).toEqual(before);
    });

    it("adding a certificate never removes access that already existed", () => {
      const a = cert({ id: "a", capabilities: ["file_access"] });
      const before = resolvePermission({ capability: "file_access" }, [a], NOW);
      expect(before.allowed).toBe(true);

      const unrelated = cert({ id: "b", capabilities: ["internet_access"] });
      const after = resolvePermission({ capability: "file_access" }, [a, unrelated], NOW);

      expect(after).toEqual(before);
    });

    it("a scope-narrowing supersession removes exactly what it superseded, nothing more", () => {
      const broad = cert({
        id: "broad",
        scope: { resourcePattern: "file:///reports/*" },
      });
      const withBroad = resolvePermission(
        { capability: "file_access", resource: "file:///reports/q3.pdf" },
        [broad],
        NOW
      );
      expect(withBroad.allowed).toBe(true);

      // Superseding `broad` with a narrower cert for one specific file...
      const superseded = { ...broad, status: "superseded" as const };
      const narrow = cert({
        id: "narrow",
        scope: { resource: "file:///reports/q3.pdf" },
      });

      const stillAllowedForNarrowedFile = resolvePermission(
        { capability: "file_access", resource: "file:///reports/q3.pdf" },
        [superseded, narrow],
        NOW
      );
      expect(stillAllowedForNarrowedFile.allowed).toBe(true);

      const noLongerAllowedForOtherFile = resolvePermission(
        { capability: "file_access", resource: "file:///reports/other.pdf" },
        [superseded, narrow],
        NOW
      );
      expect(noLongerAllowedForOtherFile.allowed).toBe(false);
    });
  });
});
