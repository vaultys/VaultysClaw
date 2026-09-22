import { describe, it, expect } from "vitest";
import {
  DEFAULT_P2P_CONNECT_WINDOW_SECONDS,
  MAX_P2P_CONNECT_WINDOW_SECONDS,
  MIN_P2P_CONNECT_WINDOW_SECONDS,
  parseP2PConnectWindowSeconds,
  validateP2PConnectWindowSeconds,
} from "@/lib/login-window";
import { AUTH_CERTIFICATE_TTL_MS } from "@/lib/user-login-channel";

describe("parseP2PConnectWindowSeconds", () => {
  it("returns a stored value in range", () => {
    expect(parseP2PConnectWindowSeconds("90")).toBe(90);
  });

  it("falls back to the default for anything unreadable", () => {
    // Total by design: this runs on the public login path, where a hand-edited or legacy row must
    // degrade to the default window rather than take sign-in down.
    for (const raw of [null, undefined, "", "   ", "abc", "NaN"]) {
      expect(parseP2PConnectWindowSeconds(raw), String(raw)).toBe(
        DEFAULT_P2P_CONNECT_WINDOW_SECONDS
      );
    }
  });

  it("clamps rather than trusting an out-of-range row", () => {
    expect(parseP2PConnectWindowSeconds("1")).toBe(MIN_P2P_CONNECT_WINDOW_SECONDS);
    expect(parseP2PConnectWindowSeconds("-30")).toBe(MIN_P2P_CONNECT_WINDOW_SECONDS);
    expect(parseP2PConnectWindowSeconds("99999")).toBe(MAX_P2P_CONNECT_WINDOW_SECONDS);
  });
});

describe("validateP2PConnectWindowSeconds", () => {
  it("accepts the bounds themselves", () => {
    expect(validateP2PConnectWindowSeconds(String(MIN_P2P_CONNECT_WINDOW_SECONDS))).toBe(
      MIN_P2P_CONNECT_WINDOW_SECONDS
    );
    expect(validateP2PConnectWindowSeconds(String(MAX_P2P_CONNECT_WINDOW_SECONDS))).toBe(
      MAX_P2P_CONNECT_WINDOW_SECONDS
    );
  });

  it("rejects rather than clamping, so nobody saves 5 and gets 30", () => {
    expect(() => validateP2PConnectWindowSeconds("5")).toThrow(/between/);
    expect(() => validateP2PConnectWindowSeconds("99999")).toThrow(/between/);
    expect(() => validateP2PConnectWindowSeconds("abc")).toThrow(/number of seconds/);
  });
});

describe("the window fits inside the credential it runs against", () => {
  it("cannot outlive the AuthCertificate row", () => {
    // The failure this bound prevents is the quiet one: a wallet connecting after the row expired
    // runs a complete, valid handshake and then cannot be redeemed, so everything looks like it
    // worked. Raising AUTH_CERTIFICATE_TTL_MS is fine; lowering it under the cap is not.
    expect(MAX_P2P_CONNECT_WINDOW_SECONDS * 1000).toBeLessThanOrEqual(AUTH_CERTIFICATE_TTL_MS);
  });

  it("has a default well inside both", () => {
    expect(DEFAULT_P2P_CONNECT_WINDOW_SECONDS).toBeGreaterThanOrEqual(MIN_P2P_CONNECT_WINDOW_SECONDS);
    expect(DEFAULT_P2P_CONNECT_WINDOW_SECONDS).toBeLessThanOrEqual(MAX_P2P_CONNECT_WINDOW_SECONDS);
  });
});
