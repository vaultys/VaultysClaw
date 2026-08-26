/**
 * Custom capability name validation (docs/CUSTOM_CAPABILITIES.md Phase 0).
 *
 * The `CustomCapability` *type* is deliberately coarse, so these runtime checks are the only real
 * gate on what a legal capability name is. `sdk-go` carries a byte-identical regex — a change to
 * the grammar here is a change to both.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  BUILTIN_CAPABILITIES,
  CUSTOM_CAPABILITY_RE,
  assertValidCapabilityName,
  filterAgainstRegistry,
  isBuiltinCapability,
  isCustomCapability,
  parseCustomCapability,
} from "../src/types";

describe("isBuiltinCapability", () => {
  it("accepts every name in BUILTIN_CAPABILITIES", () => {
    for (const c of BUILTIN_CAPABILITIES) expect(isBuiltinCapability(c)).toBe(true);
  });

  it("rejects a custom name, and never treats a built-in as custom", () => {
    expect(isBuiltinCapability("acme:invoice.approve")).toBe(false);
    for (const c of BUILTIN_CAPABILITIES) expect(isCustomCapability(c)).toBe(false);
  });

  it("rejects an unknown bare word", () => {
    expect(isBuiltinCapability("file_acess")).toBe(false);
    expect(isBuiltinCapability("")).toBe(false);
  });
});

describe("isCustomCapability", () => {
  const valid = [
    "acme:invoice.approve",
    "ac:xy",
    "acme-corp:billing_write",
    "a1:b2",
    "vendor:deeply.nested_action-name",
    `${"v".repeat(32)}:${"a".repeat(64)}`,
  ];
  const invalid = [
    ["file_access", "a built-in, no colon"],
    ["", "empty"],
    ["acme:", "no action"],
    [":approve", "no vendor"],
    ["a:b", "vendor and action both too short"],
    ["acme:a", "action too short"],
    ["a:bc", "vendor too short"],
    ["Acme:invoice", "uppercase vendor"],
    ["acme:Invoice", "uppercase action"],
    ["acme:a:b", "two colons"],
    ["-acme:invoice", "vendor starts with a hyphen"],
    ["acme:.invoice", "action starts with a dot"],
    ["ac me:invoice", "space in vendor"],
    ["acme:inv oice", "space in action"],
    ["acme_corp:invoice", "underscore in vendor"],
    ["acme:invoice/approve", "slash in action"],
    [`${"v".repeat(33)}:approve`, "vendor too long"],
    [`acme:${"a".repeat(65)}`, "action too long"],
  ] as const;

  it.each(valid)("accepts %s", (name) => {
    expect(isCustomCapability(name)).toBe(true);
    expect(CUSTOM_CAPABILITY_RE.test(name)).toBe(true);
  });

  it.each(invalid)("rejects %s (%s)", (name) => {
    expect(isCustomCapability(name)).toBe(false);
  });

  it("is anchored — a legal name embedded in junk is still rejected", () => {
    expect(isCustomCapability(" acme:invoice ")).toBe(false);
    expect(isCustomCapability("x acme:invoice")).toBe(false);
    expect(isCustomCapability("acme:invoice\n")).toBe(false);
  });
});

describe("assertValidCapabilityName", () => {
  it("passes for built-ins and well-formed custom names", () => {
    expect(() => assertValidCapabilityName("file_access")).not.toThrow();
    expect(() => assertValidCapabilityName("acme:invoice.approve")).not.toThrow();
  });

  it("tells an unnamespaced name what it is missing", () => {
    expect(() => assertValidCapabilityName("invoiceapprove")).toThrow(
      /must be namespaced as "vendor:action"/
    );
  });

  it("describes the grammar for a malformed namespaced name", () => {
    expect(() => assertValidCapabilityName("Acme:x")).toThrow(/expected "vendor:action"/);
    expect(() => assertValidCapabilityName("acme:")).toThrow(/exactly one colon/);
  });

  it("includes the offending name, so a form can show it back", () => {
    expect(() => assertValidCapabilityName("BAD NAME")).toThrow(/"BAD NAME"/);
  });
});

describe("parseCustomCapability", () => {
  it("splits on the first colon", () => {
    expect(parseCustomCapability("acme:invoice.approve")).toEqual({
      vendor: "acme",
      action: "invoice.approve",
    });
  });

  it("refuses a built-in — there is nothing to split", () => {
    expect(() => parseCustomCapability("file_access")).toThrow(
      /is a built-in capability, not a custom one/
    );
  });

  it("refuses a malformed name rather than returning half of it", () => {
    expect(() => parseCustomCapability("acme:")).toThrow();
    expect(() => parseCustomCapability("acme:a:b")).toThrow();
  });
});

describe("filterAgainstRegistry", () => {
  const registry = new Set(["acme:invoice.approve", "acme:invoice.read"]);

  it("keeps built-ins untouched — they are not registry-backed", () => {
    expect(filterAgainstRegistry(["file_access", "api_call"], new Set())).toEqual([
      "file_access",
      "api_call",
    ]);
  });

  it("keeps a custom name the registry still lists", () => {
    expect(filterAgainstRegistry(["acme:invoice.approve"], registry)).toEqual([
      "acme:invoice.approve",
    ]);
  });

  it("drops a custom name the registry no longer lists — the fail-closed mechanism", () => {
    expect(filterAgainstRegistry(["acme:invoice.delete"], registry)).toEqual([]);
  });

  it("filters a mixed set, preserving order", () => {
    expect(
      filterAgainstRegistry(
        ["api_call", "acme:invoice.delete", "acme:invoice.read", "file_access"],
        registry
      )
    ).toEqual(["api_call", "acme:invoice.read", "file_access"]);
  });

  it("drops a malformed name — neither a built-in nor a registry hit", () => {
    expect(filterAgainstRegistry(["acme:", "not_a_capability", ""], registry)).toEqual([]);
  });

  it("drops a malformed name even if the registry somehow contains it", () => {
    // Defence in depth: the registry can't hold one (every write validates), but if a row were
    // corrupted by hand, an unresolvable name must stay unresolvable.
    expect(filterAgainstRegistry(["acme:"], new Set(["acme:"]))).toEqual([]);
  });

  it("returns an empty array rather than throwing on an empty input", () => {
    expect(filterAgainstRegistry([], registry)).toEqual([]);
  });

  it("is case-sensitive, so a case variant of a registered name is dropped", () => {
    expect(filterAgainstRegistry(["ACME:invoice.approve"], registry)).toEqual([]);
  });
});

/**
 * The shared table `sdk-go/capability` also runs (`conformance/capability-names.json`).
 *
 * This grammar decides which names a deployment can ever register or grant, so the two
 * implementations disagreeing would mean one accepts a name the other can never resolve. Add cases
 * to the JSON first, then make both sides pass — never adjust one side to match.
 */
describe("shared TS/Go capability-name conformance", () => {
  const vectors = JSON.parse(
    readFileSync(new URL("../../../conformance/capability-names.json", import.meta.url), "utf-8")
  ) as { version: number; cases: { name: string; valid: boolean; $why: string }[] };

  it("is the version this suite understands, and is not silently empty", () => {
    expect(vectors.version).toBe(1);
    expect(vectors.cases.length).toBeGreaterThan(0);
  });

  for (const c of vectors.cases) {
    it(`${JSON.stringify(c.name)} → ${c.valid ? "valid" : "invalid"} (${c.$why})`, () => {
      expect(isCustomCapability(c.name)).toBe(c.valid);
    });
  }

  it("covers both outcomes — a table of only-valid cases would pass a broken regex", () => {
    expect(vectors.cases.some((c) => c.valid)).toBe(true);
    expect(vectors.cases.some((c) => !c.valid)).toBe(true);
  });
});
