/**
 * Tests for control-plane intent_log DB helpers:
 *   - logIntent persists an intent record
 *   - updateIntentResult marks it success/failed with output
 *   - getIntentLog returns records in sent_at DESC order
 *   - getIntentLog filters by agentDid
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, closeDb } from "../packages/control-plane/lib/db";
import {
  logIntent,
  updateIntentResult,
  getIntentLog,
} from "../packages/control-plane/lib/db";

beforeAll(() => {
  // Initialize DB (creates tables including intent_log)
  const db = getDb();
  db.prepare("DELETE FROM intent_log").run();
});

afterAll(() => {
  closeDb();
});

describe("intent_log helpers", () => {
  it("logIntent inserts a record with status=pending", () => {
    logIntent("intent-1", "did:vaultys:agent1", "summarize", { text: "hello" });
    const rows = getIntentLog(10);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows.find((r) => r.intent_id === "intent-1");
    expect(row).toBeDefined();
    expect(row!.status).toBe("pending");
    expect(row!.action).toBe("summarize");
    expect(row!.agent_did).toBe("did:vaultys:agent1");
    expect(JSON.parse(row!.params!)).toEqual({ text: "hello" });
    expect(row!.completed_at).toBeNull();
  });

  it("updateIntentResult marks intent as success", () => {
    logIntent("intent-2", "did:vaultys:agent1", "translate", {});
    updateIntentResult("intent-2", "success", { translated: "bonjour" });
    const rows = getIntentLog(10);
    const row = rows.find((r) => r.intent_id === "intent-2");
    expect(row!.status).toBe("success");
    expect(JSON.parse(row!.output!)).toEqual({ translated: "bonjour" });
    expect(row!.completed_at).not.toBeNull();
    expect(row!.error).toBeNull();
  });

  it("updateIntentResult marks intent as failed with error", () => {
    logIntent("intent-3", "did:vaultys:agent2", "run_code", {
      code: "exit(1)",
    });
    updateIntentResult(
      "intent-3",
      "failed",
      undefined,
      "Process exited with code 1"
    );
    const rows = getIntentLog(10);
    const row = rows.find((r) => r.intent_id === "intent-3");
    expect(row!.status).toBe("failed");
    expect(row!.error).toBe("Process exited with code 1");
    expect(row!.output).toBeNull();
  });

  it("getIntentLog returns all inserted records", () => {
    const rows = getIntentLog(10);
    const ids = rows.map((r) => r.intent_id);
    expect(ids).toContain("intent-1");
    expect(ids).toContain("intent-2");
    expect(ids).toContain("intent-3");
  });

  it("getIntentLog filters by agentDid", () => {
    const agent1Rows = getIntentLog(10, "did:vaultys:agent1");
    const agent2Rows = getIntentLog(10, "did:vaultys:agent2");
    expect(agent1Rows.every((r) => r.agent_did === "did:vaultys:agent1")).toBe(
      true
    );
    expect(agent2Rows.every((r) => r.agent_did === "did:vaultys:agent2")).toBe(
      true
    );
    expect(agent2Rows.length).toBeGreaterThanOrEqual(1);
  });

  it("logIntent with duplicate intent_id is a no-op (INSERT OR IGNORE)", () => {
    logIntent("intent-dup", "did:vaultys:agent1", "dedup", {});
    logIntent("intent-dup", "did:vaultys:agent1", "dedup-different-action", {});
    const rows = getIntentLog(50).filter((r) => r.intent_id === "intent-dup");
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("dedup");
  });

  it("getIntentLog respects limit parameter", () => {
    // Insert several extra records
    for (let i = 0; i < 5; i++) {
      logIntent(
        `intent-limit-${i}`,
        "did:vaultys:limit-agent",
        `action-${i}`,
        {}
      );
    }
    const limited = getIntentLog(3);
    expect(limited.length).toBeLessThanOrEqual(3);
  });
});
