import { describe, expect, it } from "vitest";
import {
  DEFAULT_STANDING_TTL_THRESHOLD_MS,
  isEligibleForProactiveRenewal,
} from "../src/renewal";

describe("isEligibleForProactiveRenewal", () => {
  it("is eligible for a standing certificate with a TTL above the threshold", () => {
    const eligible = isEligibleForProactiveRenewal({
      scope: undefined,
      issuedAt: 0,
      expiresAt: DEFAULT_STANDING_TTL_THRESHOLD_MS * 10,
    });
    expect(eligible).toBe(true);
  });

  it("is not eligible when the TTL is at or below the threshold", () => {
    const eligible = isEligibleForProactiveRenewal({
      scope: undefined,
      issuedAt: 0,
      expiresAt: DEFAULT_STANDING_TTL_THRESHOLD_MS,
    });
    expect(eligible).toBe(false);
  });

  it("is never eligible for a scoped certificate, regardless of TTL", () => {
    const eligible = isEligibleForProactiveRenewal({
      scope: { resource: "file:///x" },
      issuedAt: 0,
      expiresAt: DEFAULT_STANDING_TTL_THRESHOLD_MS * 100,
    });
    expect(eligible).toBe(false);
  });

  it("is never eligible for a certificate with no expiry", () => {
    const eligible = isEligibleForProactiveRenewal({
      scope: undefined,
      issuedAt: 0,
      expiresAt: null,
    });
    expect(eligible).toBe(false);
  });

  it("respects a custom threshold", () => {
    const eligible = isEligibleForProactiveRenewal(
      { scope: undefined, issuedAt: 0, expiresAt: 1000 },
      500
    );
    expect(eligible).toBe(true);
  });
});
