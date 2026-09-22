import { describe, expect, it, vi } from "vitest";
import { resolvePermission } from "@vaultysclaw/trust";
import {
  assertDemoTarget,
  expectDecisions,
  guardedOperation,
} from "../src/guided/checks.js";

const grant = {
  id: "read-only-cert",
  agentDid: "did:test:finance",
  capabilities: ["file_read"],
  status: "active" as const,
  issuedAt: 100,
  expiresAt: null,
};

describe("guided demo operation boundaries", () => {
  it("executes a granted read and records the authorizing certificate", async () => {
    const effect = vi.fn(async () => "sample invoice");
    const observed = await guardedOperation(
      "Finance",
      async (a) => resolvePermission(a, [grant], 200),
      { capability: "file_read" },
      effect
    );
    expect(effect).toHaveBeenCalledOnce();
    expect(observed).toMatchObject({
      allowed: true,
      executed: true,
      certificateId: "read-only-cert",
    });
    expectDecisions([observed], [true]);
  });

  it("never calls the file write when its capability was not granted", async () => {
    const effect = vi.fn();
    const observed = await guardedOperation(
      "Finance",
      async (a) => resolvePermission(a, [grant], 200),
      { capability: "file_write" },
      effect
    );
    expect(effect).not.toHaveBeenCalled();
    expect(observed).toMatchObject({ allowed: false, executed: false });
    expectDecisions([observed], [false]);
  });

  it("does not report successful execution if the permitted operation fails", async () => {
    await expect(
      guardedOperation(
        "Finance",
        async () => ({ allowed: true }),
        { capability: "file_read" },
        async () => {
          throw new Error("File unavailable");
        }
      )
    ).rejects.toThrow("File unavailable");
  });

  it("rejects containment when the unaffected team also loses access", () => {
    const denied = {
      actor: "Finance",
      action: "file_read",
      allowed: false,
      executed: false,
    };
    expect(() =>
      expectDecisions([denied, { ...denied, actor: "Research" }], [false, true])
    ).toThrow("has not advanced");
  });

  it("rejects missing observations and decisions without the expected execution", () => {
    expect(() => expectDecisions([], [true])).toThrow();
    expect(() =>
      expectDecisions(
        [
          {
            actor: "Finance",
            action: "file_read",
            allowed: true,
            executed: false,
          },
        ],
        [true]
      )
    ).toThrow();
  });
});

describe("demo target isolation", () => {
  it("accepts only the isolated simulator coordinates", () => {
    expect(() =>
      assertDemoTarget(
        "postgresql://vaultys:demo@localhost:5434/vaultysclaw",
        "ws://localhost:8083"
      )
    ).not.toThrow();
  });
  it.each([
    [
      "postgresql://vaultys:demo@localhost:5434/vaultysclaw?host=production",
      "ws://localhost:8083",
    ],
    [
      "postgresql://vaultys:demo@localhost:5434/vaultysclaw",
      "ws://localhost:8083/?target=production",
    ],
    [
      "postgresql://vaultys:demo@localhost:5433/vaultysclaw",
      "ws://localhost:8083",
    ],
    [
      "postgresql://vaultys:demo@production:5434/vaultysclaw",
      "ws://localhost:8083",
    ],
    [
      "postgresql://vaultys:demo@localhost:5434/production",
      "ws://localhost:8083",
    ],
    [
      "postgresql://vaultys:demo@localhost:5434/vaultysclaw",
      "ws://localhost:8081",
    ],
  ])("refuses non-demo targets", (db, ws) => {
    expect(() => assertDemoTarget(db, ws)).toThrow("isolated simulator");
  });
});
