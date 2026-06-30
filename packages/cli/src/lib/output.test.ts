import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setJsonMode,
  isJsonMode,
  ok,
  fail,
  sub,
  printJson,
  render,
} from "./output.js";

let logs: string[];
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logs = [];
  spy = vi.spyOn(console, "log").mockImplementation((m?: unknown) => {
    logs.push(String(m));
  });
  setJsonMode(false);
});
afterEach(() => {
  setJsonMode(false);
  spy.mockRestore();
});

describe("human mode", () => {
  it("renders ✓ / ✗ / ↳ lines", () => {
    ok("agent \"billing-bot\" created");
    fail('DENIED  reason: no capability "x"');
    sub("audit: intent_id=int_1");
    expect(logs[0]).toBe(' ✓ agent "billing-bot" created');
    expect(logs[1]).toBe(' ✗ DENIED  reason: no capability "x"');
    expect(logs[2]).toBe("  ↳ audit: intent_id=int_1");
  });

  it("render() runs the human renderer", () => {
    render({ a: 1 }, () => ok("done"));
    expect(logs[0]).toBe(" ✓ done");
  });
});

describe("json mode", () => {
  it("suppresses decorative lines and emits compact JSON", () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
    ok("suppressed");
    fail("suppressed");
    sub("suppressed");
    expect(logs).toHaveLength(0);

    printJson({ decision: "DENY" });
    expect(JSON.parse(logs[0])).toEqual({ decision: "DENY" });
  });

  it("render() emits JSON instead of the human renderer", () => {
    setJsonMode(true);
    render({ verified: true }, () => ok("should not run"));
    expect(JSON.parse(logs[0])).toEqual({ verified: true });
  });
});
