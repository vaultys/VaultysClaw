import { describe, expect, it } from "vitest";
import { assertProductionSecrets, nextAuthSecretProblem } from "../lib/startup-secrets";

const STRONG = "3f9a1c7e5b2d8f604a1e9c3b7d5f2a8e6c4b0d9f1e3a5c7b";

describe("nextAuthSecretProblem", () => {
  it("accepts a random secret", () => {
    expect(nextAuthSecretProblem(STRONG)).toBeNull();
  });

  it.each([
    [undefined, "not set"],
    ["   ", "not set"],
    ["insecure-dev-secret-change-me", "published"],
    ["change_me_with_openssl_rand_base64_32", "published"],
    ["please-CHANGE-ME-before-going-to-production-ok", "placeholder"],
    ["shortbutrandom-9x2", "shorter"],
    ["abababababababababababababababababab", "variety"],
  ])("rejects %j (%s)", (secret, reason) => {
    expect(nextAuthSecretProblem(secret)).toMatch(new RegExp(reason));
  });
});

describe("assertProductionSecrets", () => {
  it("throws in production with the old compose default", () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: "production", NEXTAUTH_SECRET: "insecure-dev-secret-change-me" }),
    ).toThrow(/Refusing to start/);
  });

  it("throws in production with no secret", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "production" })).toThrow(/not set/);
  });

  it("passes in production with a strong secret", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "production", NEXTAUTH_SECRET: STRONG })).not.toThrow();
  });

  it("does not apply outside production", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development" })).not.toThrow();
  });

  it("honours the demo-stack opt-out", () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: "production",
        NEXTAUTH_SECRET: "simulator-demo-not-a-real-secret",
        VAULTYSCLAW_ALLOW_INSECURE_SECRETS: "1",
      }),
    ).not.toThrow();
  });
});
