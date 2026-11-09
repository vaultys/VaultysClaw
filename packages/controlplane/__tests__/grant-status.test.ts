import { describe, expect, it } from "vitest";
import { nextStatusSeq } from "@/lib/grant-status";

describe("nextStatusSeq", () => {
  it("is strictly increasing, even within one millisecond or across a backwards clock step", () => {
    const a = nextStatusSeq(5_000_000);
    const b = nextStatusSeq(5_000_000);
    const c = nextStatusSeq(4_000_000);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("follows the clock when it moves forward, so it keeps increasing across a restart", () => {
    expect(nextStatusSeq(9_000_000)).toBe(9_000_000);
  });
});
