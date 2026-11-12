import { createHash } from "node:crypto";
import { afterEach, describe, it, expect } from "vitest";
import { isBootstrapRegistrationAllowed, tokenMatchesHash, verifyBootstrapToken } from "@/lib/bootstrap-token";

const hashOf = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

describe("tokenMatchesHash", () => {
  it("accepts the token whose hash is stored", () => {
    expect(tokenMatchesHash("s3cret-setup", hashOf("s3cret-setup"))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(tokenMatchesHash("wrong", hashOf("s3cret-setup"))).toBe(false);
    expect(tokenMatchesHash("", hashOf(""))).toBe(false);
    expect(tokenMatchesHash(null, hashOf("x"))).toBe(false);
    // No stored hash (no token issued) must never mean "open".
    expect(tokenMatchesHash("anything", undefined)).toBe(false);
    expect(tokenMatchesHash("anything", "")).toBe(false);
    // Malformed stored value: length mismatch is a refusal, not a throw from timingSafeEqual.
    expect(tokenMatchesHash("anything", "abcd")).toBe(false);
  });
});

describe("bootstrap gate with an operator-configured token", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("accepts only the configured token, without touching the database", async () => {
    process.env.CONTROLPLANE_BOOTSTRAP_TOKEN = "operator-chosen";
    expect(await verifyBootstrapToken("operator-chosen")).toBe(true);
    expect(await verifyBootstrapToken("operator-chose")).toBe(false);
    expect(await verifyBootstrapToken(null)).toBe(false);
  });

  it("stays closed in production without the token", async () => {
    process.env.CONTROLPLANE_BOOTSTRAP_TOKEN = "operator-chosen";
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN;
    expect(await isBootstrapRegistrationAllowed(null)).toBe(false);
    expect(await isBootstrapRegistrationAllowed("nope")).toBe(false);
    expect(await isBootstrapRegistrationAllowed("operator-chosen")).toBe(true);
  });
});
