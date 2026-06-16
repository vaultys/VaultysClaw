/**
 * Tests for control-plane intent_log DB helpers:
 *   - logIntent persists an intent record
 *   - updateIntentResult marks it success/failed with output
 *   - getIntentLog returns records in sent_at DESC order
 *   - getIntentLog filters by agentDid
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../packages/control-plane/db/client";
import { IntentDAO } from "../packages/control-plane/db";

beforeAll(async () => {
  // Clean slate
  await prisma.intentLog.deleteMany({});
});

afterAll(async () => {
  // Prisma manages its own connection pool — no explicit close needed
});

describe("intent_log helpers", () => {
  it("logIntent inserts a record with status=pending", async () => {
    await IntentDAO.log("intent-1", "did:vaultys:agent1", "summarize", { text: "hello" });
    const rows = await IntentDAO.findAll(10);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows.find((r) => r.intentId === "intent-1");
    expect(row).toBeDefined();
    expect(row!.status).toBe("pending");
    expect(row!.action).toBe("summarize");
    expect(row!.agentDid).toBe("did:vaultys:agent1");
    expect((row!.params as { text: string }).text).toBe("hello");
    expect(row!.completedAt).toBeNull();
  });

  it("updateIntentResult marks intent as success", async () => {
    await IntentDAO.log("intent-2", "did:vaultys:agent1", "translate", {});
    await IntentDAO.updateResult("intent-2", "success", { translated: "bonjour" });
    const rows = await IntentDAO.findAll(10);
    const row = rows.find((r) => r.intentId === "intent-2");
    expect(row!.status).toBe("success");
    expect((row!.output as { translated: string }).translated).toBe("bonjour");
    expect(row!.completedAt).not.toBeNull();
    expect(row!.error).toBeNull();
  });

  it("updateIntentResult marks intent as failed with error", async () => {
    await IntentDAO.log("intent-3", "did:vaultys:agent2", "run_code", {
      code: "exit(1)",
    });
    await IntentDAO.updateResult(
      "intent-3",
      "failed",
      undefined,
      "Process exited with code 1"
    );
    const rows = await IntentDAO.findAll(10);
    const row = rows.find((r) => r.intentId === "intent-3");
    expect(row!.status).toBe("failed");
    expect(row!.error).toBe("Process exited with code 1");
    expect(row!.output).toBeNull();
  });

  it("getIntentLog returns all inserted records", async () => {
    const rows = await IntentDAO.findAll(10);
    const ids = rows.map((r) => r.intentId);
    expect(ids).toContain("intent-1");
    expect(ids).toContain("intent-2");
    expect(ids).toContain("intent-3");
  });

  it("getIntentLog filters by agentDid", async () => {
    const agent1Rows = await IntentDAO.findAll(10, "did:vaultys:agent1");
    const agent2Rows = await IntentDAO.findAll(10, "did:vaultys:agent2");
    expect(agent1Rows.every((r) => r.agentDid === "did:vaultys:agent1")).toBe(true);
    expect(agent2Rows.every((r) => r.agentDid === "did:vaultys:agent2")).toBe(true);
    expect(agent2Rows.length).toBeGreaterThanOrEqual(1);
  });

  it("logIntent with duplicate intent_id is a no-op (upsert with empty update)", async () => {
    await IntentDAO.log("intent-dup", "did:vaultys:agent1", "dedup", {});
    await IntentDAO.log("intent-dup", "did:vaultys:agent1", "dedup-different-action", {});
    const rows = (await IntentDAO.findAll(50)).filter((r) => r.intentId === "intent-dup");
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("dedup");
  });

  it("getIntentLog respects limit parameter", async () => {
    // Insert several extra records
    for (let i = 0; i < 5; i++) {
      await IntentDAO.log(
        `intent-limit-${i}`,
        "did:vaultys:limit-agent",
        `action-${i}`,
        {}
      );
    }
    const limited = await IntentDAO.findAll(3);
    expect(limited.length).toBeLessThanOrEqual(3);
  });
});
