import { describe, it, expect } from "vitest";
import { parseWindow } from "./window-parse.js";

describe("parseWindow", () => {
  it("parses a day range + time range", () => {
    expect(parseWindow("Mon-Fri 09:00-17:00")).toEqual({
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      start: "09:00",
      end: "17:00",
    });
  });

  it("parses a comma-separated day list (ordered, deduped)", () => {
    expect(parseWindow("Fri,Mon,Wed,Mon 08:00-12:00")).toEqual({
      days: ["Mon", "Wed", "Fri"],
      start: "08:00",
      end: "12:00",
    });
  });

  it("parses a single day", () => {
    expect(parseWindow("Sat 10:00-14:00").days).toEqual(["Sat"]);
  });

  it("tolerates extra whitespace", () => {
    expect(parseWindow("  Mon-Tue   09:00-10:00 ").days).toEqual(["Mon", "Tue"]);
  });

  it.each([
    ["missing time", "Mon-Fri"],
    ["bad day", "Funday 09:00-17:00"],
    ["bad time", "Mon-Fri 9-17"],
    ["reversed time", "Mon-Fri 17:00-09:00"],
    ["reversed day range", "Fri-Mon 09:00-17:00"],
    ["out-of-range hour", "Mon 25:00-26:00"],
    ["empty", ""],
  ])("throws on invalid input: %s", (_label, input) => {
    expect(() => parseWindow(input)).toThrow();
  });
});
