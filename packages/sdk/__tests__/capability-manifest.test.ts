/**
 * Manifest parsing (docs/CUSTOM_CAPABILITIES.md Phase 4).
 *
 * Everything invalid here throws rather than warning, because each case describes an operation
 * that would otherwise be silently ungated or permanently denied — failures nobody notices until
 * the moment they matter.
 */
import { describe, it, expect } from "vitest";
import { parseCapabilityManifest, EMPTY_MANIFEST } from "../src/capability-manifest.js";

const valid = {
  version: 1,
  declares: [
    { name: "acme:invoice.approve", label: "Approve invoices", description: "In the Acme ERP." },
    { name: "file_access" },
  ],
  bindings: { erp_approve_invoice: "acme:invoice.approve", read_report: "file_access" },
};

describe("parseCapabilityManifest", () => {
  it("accepts a well-formed manifest, keeping labels and descriptions", () => {
    const m = parseCapabilityManifest(valid);
    expect(m.declares).toHaveLength(2);
    expect(m.declares[0]).toEqual({
      name: "acme:invoice.approve",
      label: "Approve invoices",
      description: "In the Acme ERP.",
    });
    expect(m.bindings.erp_approve_invoice).toBe("acme:invoice.approve");
  });

  it("accepts built-in names alongside custom ones", () => {
    expect(parseCapabilityManifest(valid).declares[1]).toEqual({
      name: "file_access",
      label: undefined,
      description: undefined,
    });
  });

  it("defaults declares and bindings to empty", () => {
    const m = parseCapabilityManifest({ version: 1 });
    expect(m.declares).toEqual([]);
    expect(m.bindings).toEqual({});
  });

  it("rejects a non-object", () => {
    expect(() => parseCapabilityManifest(null)).toThrow(/expected a JSON object/);
    expect(() => parseCapabilityManifest("nope")).toThrow(/expected a JSON object/);
  });

  it("rejects an unsupported version rather than guessing", () => {
    expect(() => parseCapabilityManifest({ version: 2 })).toThrow(/unsupported version/);
    expect(() => parseCapabilityManifest({})).toThrow(/unsupported version/);
  });

  it("rejects a malformed capability name, with the grammar in the message", () => {
    expect(() =>
      parseCapabilityManifest({ version: 1, declares: [{ name: "Acme:Invoice" }] })
    ).toThrow(/expected "vendor:action"/);
  });

  it("rejects an unnamespaced name that isn't a built-in", () => {
    expect(() =>
      parseCapabilityManifest({ version: 1, declares: [{ name: "invoiceapprove" }] })
    ).toThrow(/must be namespaced/);
  });

  it("rejects a duplicate declaration — one of the two would be dead", () => {
    expect(() =>
      parseCapabilityManifest({
        version: 1,
        declares: [{ name: "acme:a.b" }, { name: "acme:a.b" }],
      })
    ).toThrow(/declared more than once/);
  });

  it("rejects a binding to an undeclared capability — it could only ever be denied", () => {
    expect(() =>
      parseCapabilityManifest({
        version: 1,
        declares: [{ name: "acme:invoice.approve" }],
        bindings: { pay: "acme:invoice.pay" },
      })
    ).toThrow(/names "acme:invoice.pay", which is not in "declares"/);
  });

  it("rejects a binding whose value is not a string", () => {
    expect(() =>
      parseCapabilityManifest({ version: 1, declares: [], bindings: { pay: 42 } })
    ).toThrow(/must name a capability as a string/);
  });

  it("rejects bindings given as an array", () => {
    expect(() => parseCapabilityManifest({ version: 1, bindings: [] })).toThrow(
      /"bindings" must be an object/
    );
  });

  it("rejects a declares entry with no name", () => {
    expect(() => parseCapabilityManifest({ version: 1, declares: [{ label: "x" }] })).toThrow(
      /needs a string "name"/
    );
  });

  it("names the source in its errors, so a file path shows up", () => {
    expect(() => parseCapabilityManifest({ version: 9 }, "/etc/caps.json")).toThrow(
      /^\/etc\/caps\.json:/
    );
  });
});

describe("EMPTY_MANIFEST", () => {
  it("is frozen — a shared default must not be mutable by one consumer", () => {
    expect(Object.isFrozen(EMPTY_MANIFEST)).toBe(true);
  });
});
