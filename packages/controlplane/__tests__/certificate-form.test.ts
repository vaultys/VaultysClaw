import { describe, it, expect } from "vitest";
import { parseResourceLimits } from "@/lib/certificate-form";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("parseResourceLimits", () => {
  it("returns null for a form with neither field filled in", () => {
    // A certificate issued from an untouched form must be byte-identical to one
    // issued before these fields existed — an empty object in the signed grant
    // is not the same artefact as no object.
    expect(parseResourceLimits(form({}))).toBeNull();
    expect(parseResourceLimits(form({ allowedDomains: "   ", srt: "  \n " }))).toBeNull();
  });

  it("accepts domains separated by commas or newlines, since both get pasted", () => {
    expect(parseResourceLimits(form({ allowedDomains: "a.com, b.com" }))).toEqual({
      allowedDomains: ["a.com", "b.com"],
    });
    expect(parseResourceLimits(form({ allowedDomains: "a.com\nb.com\n\n" }))).toEqual({
      allowedDomains: ["a.com", "b.com"],
    });
  });

  it("omits the key entirely rather than writing an empty array", () => {
    // Empty and absent are opposites downstream: a supervisor reads an absent
    // allowedDomains as "no limit" and an empty one as "deny everything".
    const limits = parseResourceLimits(form({ srt: '{"filesystem":{}}' }));
    expect(limits).not.toBeNull();
    expect("allowedDomains" in limits!).toBe(false);
  });

  it("carries the srt block through unchanged, including keys it does not know", () => {
    const block = {
      filesystem: { denyRead: ["~/.aws"] },
      someFutureKey: { nested: true },
    };
    const limits = parseResourceLimits(form({ srt: JSON.stringify(block) }));
    expect(limits?.srt).toEqual(block);
  });

  it("refuses malformed JSON rather than dropping it", () => {
    // A certificate that silently carries no confinement while its issuer
    // believes it does is the failure this subsystem exists to prevent.
    expect(() => parseResourceLimits(form({ srt: '{"filesystem":' }))).toThrow(/not valid JSON/);
  });

  it("refuses a JSON value that is not an object", () => {
    expect(() => parseResourceLimits(form({ srt: "[1,2]" }))).toThrow(/must be a JSON object/);
    expect(() => parseResourceLimits(form({ srt: '"hello"' }))).toThrow(/must be a JSON object/);
    expect(() => parseResourceLimits(form({ srt: "null" }))).toThrow(/must be a JSON object/);
  });

  it("keeps both fields when both are given", () => {
    const limits = parseResourceLimits(
      form({ allowedDomains: "api.anthropic.com", srt: '{"network":{"deniedDomains":["evil.com"]}}' })
    );
    expect(limits).toEqual({
      allowedDomains: ["api.anthropic.com"],
      srt: { network: { deniedDomains: ["evil.com"] } },
    });
  });
});
