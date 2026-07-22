/**
 * Unit tests for the proxy's governance decision, `evaluateRequest`
 * (packages/proxy/src/http-server.ts) — factored out of the raw HTTP
 * listener so the MCP front-end (mcp-server.ts) can reuse it. Exercises the
 * decision logic directly against a real (temp-file) LocalDb, without a
 * socket or control-plane connection.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VaultysId } from "@vaultys/id";
import { evaluateRequest } from "../packages/proxy/src/http-server";
import { signRequest } from "../packages/proxy/src/identity";
import { LocalDb } from "../packages/proxy/src/local-db";
import type { WSProxyConfigPayload } from "@vaultysclaw/shared";

const UPSTREAM = { id: "u1", name: "upstream", baseUrl: "https://api.example.com" };

describe("proxy evaluateRequest", () => {
  let dbPath: string;
  let localDb: LocalDb;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `proxy-test-${Date.now()}-${Math.random()}.db`);
    localDb = new LocalDb(dbPath);
  });

  afterEach(() => {
    localDb.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
  });

  function saveConfig(overrides: Partial<WSProxyConfigPayload>) {
    localDb.saveConfig({
      defaultMode: "deny",
      upstreams: [UPSTREAM],
      rules: [],
      principals: [],
      ...overrides,
    });
  }

  it("returns a 403 error when no config has been synced yet", async () => {
    const result = await evaluateRequest("GET", "/x", {}, Buffer.alloc(0), localDb);
    expect(result).toMatchObject({ status: 403 });
  });

  it("allows a no_check rule without resolving any identity", async () => {
    saveConfig({
      rules: [{ id: "r1", method: "GET", urlPattern: "*", mode: "no_check" }],
    });
    const result = await evaluateRequest("GET", "/orders", {}, Buffer.alloc(0), localDb);
    expect(result).toMatchObject({ verdict: "allow", mode: "no_check" });
  });

  it("falls back to defaultMode=passthrough when no rule matches", async () => {
    saveConfig({ defaultMode: "passthrough", rules: [] });
    const result = await evaluateRequest("GET", "/unmatched", {}, Buffer.alloc(0), localDb);
    expect(result).toMatchObject({ verdict: "allow", mode: "default_passthrough" });
  });

  it("denies by default when no rule matches and defaultMode=deny", async () => {
    saveConfig({ defaultMode: "deny", rules: [] });
    const result = await evaluateRequest("GET", "/unmatched", {}, Buffer.alloc(0), localDb);
    expect(result).toMatchObject({ verdict: "deny", mode: "default_deny" });
  });

  it("denies a governed rule with no signature and no extractable principal id", async () => {
    saveConfig({
      rules: [{ id: "r1", method: "POST", urlPattern: "*", mode: "governed", governanceRule: "internet_access" }],
    });
    const result = await evaluateRequest("POST", "/orders", {}, Buffer.alloc(0), localDb);
    expect(result).toMatchObject({ verdict: "deny", mode: "governed", reason: "Invalid or missing signature" });
  });

  it("denies a governed rule when the resolved principal is unrecognized", async () => {
    saveConfig({
      rules: [
        {
          id: "r1",
          method: "POST",
          urlPattern: "*",
          mode: "governed",
          governanceRule: "internet_access",
          principalIdSource: { from: "header", key: "x-caller-id" },
        },
      ],
      principals: [],
    });
    const result = await evaluateRequest(
      "POST",
      "/orders",
      { "x-caller-id": "customer-42" },
      Buffer.alloc(0),
      localDb
    );
    expect(result).toMatchObject({ verdict: "deny", mode: "governed", reason: "Unrecognized principal" });
    // Proxy-provisioning still mints and durably persists an identity for this externalId.
    expect((result as any).externalId).toBe("customer-42");
  });

  it("denies a governed rule when the principal lacks the required governance rule", async () => {
    saveConfig({
      rules: [
        {
          id: "r1",
          method: "POST",
          urlPattern: "*",
          mode: "governed",
          governanceRule: "internet_access",
          principalIdSource: { from: "header", key: "x-caller-id" },
        },
      ],
      principals: [],
    });
    // First request mints the proxy-provisioned identity.
    const first = await evaluateRequest(
      "POST",
      "/orders",
      { "x-caller-id": "customer-42" },
      Buffer.alloc(0),
      localDb
    );
    const did = (first as any).principalDid;

    // Admin approves the principal but without the required rule.
    saveConfig({
      rules: [
        {
          id: "r1",
          method: "POST",
          urlPattern: "*",
          mode: "governed",
          governanceRule: "internet_access",
          principalIdSource: { from: "header", key: "x-caller-id" },
        },
      ],
      principals: [{ id: "p1", did, governanceRules: [], status: "active", provisionedByProxy: true }],
    });

    const result = await evaluateRequest(
      "POST",
      "/orders",
      { "x-caller-id": "customer-42" },
      Buffer.alloc(0),
      localDb
    );
    expect(result).toMatchObject({
      verdict: "deny",
      mode: "governed",
      reason: "Governance rule 'internet_access' not granted",
    });
  });

  it("allows a governed rule once the principal is active and holds the required rule", async () => {
    saveConfig({
      rules: [
        {
          id: "r1",
          method: "POST",
          urlPattern: "*",
          mode: "governed",
          governanceRule: "internet_access",
          principalIdSource: { from: "header", key: "x-caller-id" },
        },
      ],
      principals: [],
    });
    const first = await evaluateRequest(
      "POST",
      "/orders",
      { "x-caller-id": "customer-42" },
      Buffer.alloc(0),
      localDb
    );
    const did = (first as any).principalDid;

    saveConfig({
      rules: [
        {
          id: "r1",
          method: "POST",
          urlPattern: "*",
          mode: "governed",
          governanceRule: "internet_access",
          principalIdSource: { from: "header", key: "x-caller-id" },
        },
      ],
      principals: [
        { id: "p1", did, governanceRules: ["internet_access"], status: "active", provisionedByProxy: true },
      ],
    });

    const result = await evaluateRequest(
      "POST",
      "/orders",
      { "x-caller-id": "customer-42" },
      Buffer.alloc(0),
      localDb
    );
    expect(result).toMatchObject({ verdict: "allow", mode: "governed", principalDid: did });
  });

  it("allows a governed rule for a self-signed caller holding its own VaultysId", async () => {
    const callerVid = (await VaultysId.generateMachine()).toVersion(1);
    const method = "POST";
    const reqPath = "/orders";
    const fullUrl = new URL(reqPath, UPSTREAM.baseUrl).toString();
    const body = Buffer.from(JSON.stringify({ item: "widget" }));
    const header = await signRequest(callerVid, method, fullUrl, body);

    saveConfig({
      rules: [{ id: "r1", method: "POST", urlPattern: "*", mode: "governed", governanceRule: "internet_access" }],
      principals: [
        {
          id: "p1",
          did: callerVid.did,
          governanceRules: ["internet_access"],
          status: "active",
          provisionedByProxy: false,
        },
      ],
    });

    const result = await evaluateRequest(method, reqPath, { "x-vaultysid": header }, body, localDb);
    expect(result).toMatchObject({
      verdict: "allow",
      mode: "governed",
      principalDid: callerVid.did,
      identitySource: "self_signed",
    });
  });

  it("denies a self-signed request whose signature doesn't match the actual request", async () => {
    const callerVid = (await VaultysId.generateMachine()).toVersion(1);
    const fullUrl = new URL("/orders", UPSTREAM.baseUrl).toString();
    // Sign for a different path than the one actually requested.
    const header = await signRequest(callerVid, "POST", fullUrl, Buffer.alloc(0));

    saveConfig({
      rules: [{ id: "r1", method: "POST", urlPattern: "*", mode: "governed", governanceRule: "internet_access" }],
      principals: [
        { id: "p1", did: callerVid.did, governanceRules: ["internet_access"], status: "active", provisionedByProxy: false },
      ],
    });

    const result = await evaluateRequest(
      "POST",
      "/different-path",
      { "x-vaultysid": header },
      Buffer.alloc(0),
      localDb
    );
    expect(result).toMatchObject({ verdict: "deny", mode: "governed", reason: "Invalid or missing signature" });
  });
});
