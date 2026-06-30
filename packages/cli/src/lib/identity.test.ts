import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateIdentity,
  loadOrCreateCliIdentity,
  loadCliIdentity,
  createAgentIdentity,
  loadVaultysId,
  vidLabel,
} from "./identity.js";
import { agentIdPath } from "./config.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-cli-"));
  process.env.VC_HOME = tmp;
});

afterEach(() => {
  delete process.env.VC_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("vidLabel", () => {
  it("formats a short passport label", () => {
    expect(vidLabel("3f9a1b2c3d4ec21")).toBe("vid_3f9a…c21");
  });
  it("handles very short fingerprints", () => {
    expect(vidLabel("ab12")).toBe("vid_ab12");
  });
  it("strips non-alphanumerics", () => {
    expect(vidLabel("did:vaultys:3f9axxxxxxc21")).toMatch(/^vid_didv…/);
  });
});

describe("generateIdentity", () => {
  it("produces a usable VaultysId with did/fingerprint/publicKey", async () => {
    const id = await generateIdentity();
    expect(id.did).toBeTruthy();
    expect(id.fingerprint).toBeTruthy();
    expect(id.publicKey.length).toBeGreaterThan(0);
    // Secret round-trips back to the same DID.
    const reloaded = loadVaultysId(id.secret);
    expect(reloaded.did).toBe(id.did);
  });
});

describe("CLI identity persistence", () => {
  it("creates then reloads the same identity", async () => {
    const created = await loadOrCreateCliIdentity();
    const reloaded = await loadOrCreateCliIdentity();
    expect(reloaded.did).toBe(created.did);
    expect(loadCliIdentity()?.did).toBe(created.did);
  });
});

describe("createAgentIdentity", () => {
  it("writes a per-agent secret file that round-trips", async () => {
    const id = await createAgentIdentity("billing-bot");
    const p = agentIdPath("billing-bot");
    expect(fs.existsSync(p)).toBe(true);
    const secret = fs.readFileSync(p, "utf-8");
    expect(loadVaultysId(secret).did).toBe(id.did);
  });

  it("sanitizes path separators so the file stays in the agents dir", async () => {
    await createAgentIdentity("../evil/name");
    const p = agentIdPath("../evil/name");
    // Slashes are stripped, so the file lands directly under <home>/agents.
    expect(path.dirname(p)).toBe(path.join(tmp, "agents"));
    expect(path.basename(p)).toBe(".._evil_name.id");
  });
});
