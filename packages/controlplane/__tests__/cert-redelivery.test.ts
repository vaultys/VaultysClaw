import { describe, it, expect } from "vitest";
import { selectRedeliverableCertificate, type RedeliverableCert } from "@/lib/certificates";

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const registry = new Set(["acme:invoice.approve"]);

const cert = (over: Partial<RedeliverableCert> = {}): RedeliverableCert => ({
  id: "cert-1",
  certificate: "SIGNED-BYTES",
  capabilities: ["file_read", "file_write"],
  expiresAt: new Date(NOW + 3_600_000),
  ...over,
});

describe("selectRedeliverableCertificate", () => {
  it("re-delivers a live certificate to a reconnecting Actor", () => {
    // The whole point: a client that keeps no local cache asks on every
    // reconnect, and the answer already exists in the ledger. Without this,
    // every restart filed a fresh PendingRegistration and the approval queue
    // grew one phantom row per reconnect.
    const got = selectRedeliverableCertificate([cert()], registry, undefined, NOW);
    expect(got?.cert.id).toBe("cert-1");
    expect(got?.capabilities).toEqual(["file_read", "file_write"]);
  });

  it("refuses an expired certificate rather than trusting the row's status", () => {
    // A certificate can expire while its holder is offline and nothing rewrites
    // the row, so an "active" row is not proof of a live grant.
    const expired = cert({ expiresAt: new Date(NOW - 1) });
    expect(selectRedeliverableCertificate([expired], registry, undefined, NOW)).toBeNull();
  });

  it("accepts one that never expires", () => {
    expect(selectRedeliverableCertificate([cert({ expiresAt: null })], registry, undefined, NOW)).not.toBeNull();
  });

  it("skips an expired certificate to reach a live one", () => {
    const got = selectRedeliverableCertificate(
      [cert({ id: "old", expiresAt: new Date(NOW - 1) }), cert({ id: "live" })],
      registry,
      undefined,
      NOW
    );
    expect(got?.cert.id).toBe("live");
  });

  it("drops a custom capability the registry no longer lists", () => {
    const got = selectRedeliverableCertificate(
      [cert({ capabilities: ["file_read", "acme:deleted"] })],
      registry,
      undefined,
      NOW
    );
    expect(got?.capabilities).toEqual(["file_read"]);
  });

  it("refuses a certificate whose every capability was deleted", () => {
    // Re-sending an empty grant would look like a successful delivery of
    // nothing, which is worse than falling through to the approval path.
    const got = selectRedeliverableCertificate(
      [cert({ capabilities: ["acme:deleted"] })],
      registry,
      undefined,
      NOW
    );
    expect(got).toBeNull();
  });

  it("answers a request the held certificate fully covers", () => {
    const got = selectRedeliverableCertificate([cert()], registry, ["file_read"], NOW);
    expect(got?.cert.id).toBe("cert-1");
  });

  it("falls through when something new is asked for", () => {
    // An admin still has to see a request for something nobody approved.
    // Answering anyway would silently drop the unapproved half, and the Actor
    // could not tell that from a grant.
    const got = selectRedeliverableCertificate([cert()], registry, ["file_read", "code_execution"], NOW);
    expect(got).toBeNull();
  });

  it("returns null when the Actor holds nothing", () => {
    expect(selectRedeliverableCertificate([], registry, undefined, NOW)).toBeNull();
  });
});
