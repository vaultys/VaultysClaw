import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-enrollment-tokens";
});

// Imported after the secret is set (module reads process.env at call time, not import).
import {
  signEnrollmentToken,
  verifyEnrollmentToken,
} from "../packages/control-plane/lib/agent-enrollment";

describe("agent enrollment tokens", () => {
  it("round-trips valid claims", () => {
    const token = signEnrollmentToken({ userId: "user-1", workspaceId: "ws-1" });
    expect(verifyEnrollmentToken(token)).toEqual({
      userId: "user-1",
      workspaceId: "ws-1",
    });
  });

  it("rejects an expired token", () => {
    const token = signEnrollmentToken(
      { userId: "user-1", workspaceId: "ws-1" },
      -1 // already expired
    );
    expect(verifyEnrollmentToken(token)).toBeNull();
  });

  it("rejects a tampered payload or signature", () => {
    const token = signEnrollmentToken({ userId: "user-1", workspaceId: "ws-1" });
    const [body, sig] = token.split(".");
    // swap the signature
    expect(verifyEnrollmentToken(`${body}.${sig}x`)).toBeNull();
    // tamper the body (signature no longer matches)
    const forged = Buffer.from(
      JSON.stringify({ uid: "attacker", ws: "ws-9", exp: 9999999999 })
    ).toString("base64url");
    expect(verifyEnrollmentToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects null/garbage input", () => {
    expect(verifyEnrollmentToken(null)).toBeNull();
    expect(verifyEnrollmentToken("")).toBeNull();
    expect(verifyEnrollmentToken("not-a-token")).toBeNull();
    expect(verifyEnrollmentToken("a.b.c")).toBeNull();
  });
});
