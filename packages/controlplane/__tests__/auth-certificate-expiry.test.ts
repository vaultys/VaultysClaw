import { describe, it, expect } from "vitest";
import { AUTH_CERTIFICATE_TTL_MS, isAuthCertificateExpired } from "@/lib/user-login-channel";

const startedAt = (msAgo: number) => ({ startedAt: new Date(Date.now() - msAgo) });

describe("isAuthCertificateExpired", () => {
  it("accepts a row inside the window", () => {
    expect(isAuthCertificateExpired(startedAt(0))).toBe(false);
    expect(isAuthCertificateExpired(startedAt(AUTH_CERTIFICATE_TTL_MS - 1_000))).toBe(false);
  });

  it("rejects a row past it", () => {
    expect(isAuthCertificateExpired(startedAt(AUTH_CERTIFICATE_TTL_MS + 1_000))).toBe(true);
    // The case this exists for: a `key` found in a browser history or a proxy log long after the
    // login it belonged to. Before the TTL, this still bought a session.
    expect(isAuthCertificateExpired(startedAt(30 * 24 * 60 * 60 * 1_000))).toBe(true);
  });

  it("is exact at the boundary", () => {
    const now = Date.UTC(2026, 8, 22, 12, 0, 0);
    const row = { startedAt: new Date(now - AUTH_CERTIFICATE_TTL_MS) };
    expect(isAuthCertificateExpired(row, now)).toBe(false);
    expect(isAuthCertificateExpired(row, now + 1)).toBe(true);
  });

  it("outlives the client's own polling window", () => {
    // `app/login/page.tsx` polls 180 times at 1s and then fails on its own. The TTL has to be
    // comfortably longer than that, or a live QR scan would expire under someone mid-handshake.
    expect(AUTH_CERTIFICATE_TTL_MS).toBeGreaterThan(180 * 1_000);
  });
});
