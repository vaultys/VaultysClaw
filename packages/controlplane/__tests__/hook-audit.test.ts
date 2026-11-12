import { describe, it, expect } from "vitest";
import { MAX_HOOK_AUDIT_BATCH, parseHookAuditBatch, parseHookAuditEvent } from "@/lib/hook-audit";

const now = new Date("2026-11-12T12:00:00Z");

// A real vaultysclaw-hooks spool line (internal/audit.Record), as its agent forwards it.
const record = {
  id: "9f2c4e1a0b7d4c3e8a1f5b6c7d8e9f01",
  time: "2026-11-12T11:59:00Z",
  vendor: "claude-code",
  event: "PreToolUse",
  kind: "pre_tool",
  mode: "observe",
  session: "s1",
  cwd: "/home/alice/repo",
  tool: "Read",
  vendorTool: "Read",
  capability: "file_read",
  resource: "file:///home/alice/.ssh/id_rsa",
  decided: true,
  wouldDeny: true,
  floorRefused: true,
  reason: "refused: on the safety floor (/home/alice/.ssh)",
};

describe("parseHookAuditEvent", () => {
  it("accepts a real record and keeps the decision fields", () => {
    const e = parseHookAuditEvent(record, now)!;
    expect(e.eventId).toBe(record.id);
    expect(e.kind).toBe("pre_tool");
    expect(e.wouldDeny).toBe(true);
    expect(e.blocked).toBe(false);
    expect(e.floorRefused).toBe(true);
    expect(e.resource).toBe(record.resource);
  });

  it("drops fields it does not know, so tool input can never be stored", () => {
    const e = parseHookAuditEvent({ ...record, input: { content: "SECRET" }, prompt: "SECRET" }, now)!;
    expect(JSON.stringify(e)).not.toContain("SECRET");
  });

  it("rejects anything without an id, a valid time or a known kind", () => {
    expect(parseHookAuditEvent({ ...record, id: undefined }, now)).toBeNull();
    expect(parseHookAuditEvent({ ...record, id: "bad id; drop table" }, now)).toBeNull();
    expect(parseHookAuditEvent({ ...record, time: "yesterday" }, now)).toBeNull();
    expect(parseHookAuditEvent({ ...record, kind: "exfiltrate" }, now)).toBeNull();
    expect(parseHookAuditEvent("a string", now)).toBeNull();
    expect(parseHookAuditEvent([record], now)).toBeNull();
  });

  it("clamps a future timestamp to now, and an unknown mode to 'unknown'", () => {
    const e = parseHookAuditEvent({ ...record, time: "2099-01-01T00:00:00Z", mode: "permissive" }, now)!;
    expect(e.occurredAt).toEqual(now);
    expect(e.mode).toBe("unknown");
  });

  it("treats only literal true as true", () => {
    const e = parseHookAuditEvent({ ...record, blocked: "true", decided: 1 }, now)!;
    expect(e.blocked).toBe(false);
    expect(e.decided).toBe(false);
  });

  it("clips oversized strings", () => {
    const e = parseHookAuditEvent({ ...record, reason: "x".repeat(10_000) }, now)!;
    expect(e.reason!.length).toBe(2048);
  });
});

describe("parseHookAuditBatch", () => {
  it("counts rejected events and truncates past the cap", () => {
    const events = [...Array(MAX_HOOK_AUDIT_BATCH + 3)].map((_, i) => ({ ...record, id: `id${i}` }));
    events[0] = { ...record, id: "" };
    const { accepted, rejected, truncated } = parseHookAuditBatch(events, now);
    expect(truncated).toBe(3);
    expect(rejected).toBe(1);
    expect(accepted.length).toBe(MAX_HOOK_AUDIT_BATCH - 1);
  });

  it("returns nothing for a payload that is not an array", () => {
    expect(parseHookAuditBatch({ not: "an array" }, now).accepted).toEqual([]);
  });
});
