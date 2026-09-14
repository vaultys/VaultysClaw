import { describe, it, expect } from "vitest";
import { splitSrtBlock, serializeSrtBlock } from "@/lib/srt-block";

function roundTrip(block: Record<string, unknown>): Record<string, unknown> | null {
  const { lists, extras, fsExtras, netExtras } = splitSrtBlock(block);
  const out = serializeSrtBlock(lists, extras, fsExtras, netExtras);
  return out === "" ? null : JSON.parse(out);
}

describe("the srt settings builder's merge", () => {
  it("submits nothing at all when nothing was entered", () => {
    // A certificate issued without confinement must carry no srt block rather
    // than an empty scaffold — absent and empty mean different things to the
    // supervisor reading it.
    expect(roundTrip({})).toBeNull();
  });

  it("preserves unknown top-level keys", () => {
    const block = { ignoreViolations: { npm: ["/private/tmp"] }, somethingNew: 1 };
    expect(roundTrip(block)).toMatchObject(block);
  });

  it("preserves unknown keys nested inside filesystem and network", () => {
    // The case a single top-level bucket would lose while appearing to preserve
    // unknown settings, which is worse than not claiming to preserve them.
    const out = roundTrip({
      filesystem: { denyRead: ["~/.ssh"], someFsFlag: true },
      network: { deniedDomains: ["evil.com"], allowUnixSockets: ["/var/run/docker.sock"] },
    });
    expect((out!.filesystem as Record<string, unknown>).someFsFlag).toBe(true);
    expect((out!.network as Record<string, unknown>).allowUnixSockets).toEqual([
      "/var/run/docker.sock",
    ]);
  });

  it("round-trips the managed lists unchanged", () => {
    const block = {
      filesystem: {
        denyRead: ["~/.aws"],
        allowRead: ["./docs"],
        allowWrite: ["."],
        denyWrite: [".env"],
      },
      network: { deniedDomains: ["ads.example.com"] },
    };
    expect(roundTrip(block)).toMatchObject(block);
  });

  it("ignores non-array values where a list is expected", () => {
    // Hand-written JSON reaches this; a string where an array belongs must not
    // become a list of characters.
    const { lists } = splitSrtBlock({ filesystem: { denyRead: "~/.ssh" } });
    expect(lists.denyRead).toEqual([]);
  });

  it("drops non-string entries rather than emitting them", () => {
    const { lists } = splitSrtBlock({ filesystem: { denyRead: ["~/.ssh", 42, null] } });
    expect(lists.denyRead).toEqual(["~/.ssh"]);
  });

  it("keeps a block that has only unknown keys", () => {
    // Every managed list is empty, but the admin wrote something — submitting
    // nothing here would discard it silently.
    expect(roundTrip({ ignoreViolations: { "*": ["/usr/bin"] } })).not.toBeNull();
  });
});
