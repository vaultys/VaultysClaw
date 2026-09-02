/**
 * DID ↔ URL-segment encoding.
 *
 * The interesting property is not the round trip (that would pass with any encoding) but that the
 * output is **exactly** Node's `base64url`. These helpers run in Client Components, where `Buffer`
 * is a polyfill that throws `Unknown encoding: base64url` — so the implementation does the
 * alphabet swap by hand, and this pins that the hand-rolled version has not drifted from the
 * encoding that produced every URL already in the wild.
 */
import { describe, it, expect } from "vitest";
import { encodeDidParam, decodeDidParam } from "@/lib/actor-route";

const DIDS = [
  "did:vaultys:0027e83f5d035a5dc5651126a10606f2f4d9701e",
  "did:vaultys:0071ec50c977d4e05682764806c7fc03556de6af",
  "did:vaultys:00",
  "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
];

describe("encodeDidParam", () => {
  it.each(DIDS)("matches Node's base64url byte-for-byte: %s", (did) => {
    expect(encodeDidParam(did)).toBe(Buffer.from(did, "utf8").toString("base64url"));
  });

  it("never emits a character that needs escaping in a URL path segment", () => {
    for (const did of DIDS) {
      expect(encodeDidParam(did)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("emits no padding", () => {
    // "did:vaultys:0" is 13 bytes — not a multiple of 3, so padded base64 would end in "=".
    expect(encodeDidParam("did:vaultys:0")).not.toContain("=");
  });

  it("does not use the standard-base64 characters that break URLs", () => {
    // A payload chosen to force both + and / in standard base64.
    const forcesBoth = "ÿï¾";
    expect(Buffer.from(forcesBoth, "utf8").toString("base64")).toMatch(/[+/]/);
    expect(encodeDidParam(forcesBoth)).not.toMatch(/[+/]/);
  });
});

describe("decodeDidParam", () => {
  it.each(DIDS)("round-trips: %s", (did) => {
    expect(decodeDidParam(encodeDidParam(did))).toBe(did);
  });

  it("decodes a value produced by Node's base64url — URLs already issued must keep working", () => {
    for (const did of DIDS) {
      expect(decodeDidParam(Buffer.from(did, "utf8").toString("base64url"))).toBe(did);
    }
  });

  it("accepts a padded value too, in case one was stored somewhere", () => {
    const padded = Buffer.from(DIDS[0], "utf8").toString("base64");
    expect(decodeDidParam(padded.replace(/\+/g, "-").replace(/\//g, "_"))).toBe(DIDS[0]);
  });
});
