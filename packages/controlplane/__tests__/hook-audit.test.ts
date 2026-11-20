import { describe, it, expect } from "vitest";
import {
  coverageDegradations,
  MAX_HOOK_AUDIT_BATCH,
  parseHookAuditBatch,
  parseHookAuditEvent,
  parseHookCoverage,
} from "@/lib/hook-audit";

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

describe("parseHookCoverage", () => {
  const report = {
    mode: "enforce",
    scope: "machine",
    tamperResistant: true,
    vendors: [
      { vendor: "claude-code", level: "enforcing", found: true },
      { vendor: "cursor", level: "partial", found: true, reasons: ["web search is not hooked"] },
    ],
  };

  it("accepts a well-formed report", () => {
    const r = parseHookCoverage(report)!;
    expect(r.mode).toBe("enforce");
    expect(r.tamperResistant).toBe(true);
    expect(r.vendors.map((v) => v.level)).toEqual(["enforcing", "partial"]);
    expect(r.vendors[1].reasons).toEqual(["web search is not hooked"]);
  });

  it("reads an unknown level as ungoverned, never as something better", () => {
    const r = parseHookCoverage({ ...report, vendors: [{ vendor: "x", level: "super-enforcing" }] })!;
    expect(r.vendors[0].level).toBe("ungoverned");
    expect(r.vendors[0].reasons[0]).toMatch(/unrecognised coverage level/);
  });

  it("never claims tamper resistance at user scope", () => {
    expect(parseHookCoverage({ ...report, scope: "user" })!.tamperResistant).toBe(false);
    expect(parseHookCoverage({ ...report, tamperResistant: "yes" })!.tamperResistant).toBe(false);
  });

  it("caps and clips what a host can make it store", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      vendor: `v${i}`,
      level: "observe",
      reasons: Array.from({ length: 50 }, () => "r".repeat(5000)),
    }));
    const r = parseHookCoverage({ ...report, vendors: many })!;
    expect(r.vendors).toHaveLength(32);
    expect(r.vendors[0].reasons).toHaveLength(16);
    expect(r.vendors[0].reasons[0]).toHaveLength(512);
  });

  it("rejects what is not a report", () => {
    expect(parseHookCoverage(null)).toBeNull();
    expect(parseHookCoverage({ mode: "enforce" })).toBeNull();
    expect(parseHookCoverage([])).toBeNull();
  });
});

describe("coverageDegradations", () => {
  const cov = (mode: string, scope: string, vendors: [string, string][]) =>
    parseHookCoverage({ mode, scope, tamperResistant: scope === "machine", vendors: vendors.map(([vendor, level]) => ({ vendor, level })) })!;

  it("flags a lower level, never a higher one", () => {
    const before = cov("enforce", "machine", [["cursor", "enforcing"], ["codex", "observe"]]);
    const after = cov("enforce", "machine", [["cursor", "partial"], ["codex", "enforcing"]]);
    const d = coverageDegradations(before, after);
    expect(d.vendors.map((v) => [v.vendor, v.from, v.to])).toEqual([["cursor", "enforcing", "partial"]]);
    expect(d.host).toEqual([]);
  });

  it("reports an ungoverned harness on a first report, but not a governed one", () => {
    const d = coverageDegradations(null, cov("enforce", "machine", [["cursor", "ungoverned"], ["codex", "enforcing"]]));
    expect(d.vendors.map((v) => [v.vendor, v.from])).toEqual([["cursor", null]]);
  });

  it("does not treat an uninstalled harness as degraded", () => {
    const d = coverageDegradations(cov("enforce", "machine", [["cursor", "enforcing"]]), cov("enforce", "machine", []));
    expect(d.vendors).toEqual([]);
  });

  it("flags enforce → observe and machine → user", () => {
    const d = coverageDegradations(cov("enforce", "machine", []), cov("observe", "user", []));
    expect(d.host).toHaveLength(2);
  });
});
