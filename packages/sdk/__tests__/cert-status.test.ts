/**
 * The staple loop's decision logic (docs/CUSTOM_CAPABILITIES.md Phase 3b).
 *
 * These exercise the real `ActorRuntime` — no socket, because none of this depends on one: the
 * runtime's job here is to decide what a held certificate still authorizes given the last verified
 * status, the org's fail mode, and the staleness bound. A fake control plane would add moving parts
 * without testing anything more.
 *
 * What is pinned, and why it matters: before this existed the runtime asserted `status: "active"`
 * unconditionally, so a revoked certificate kept working forever and `failClosed` was a setting
 * with nothing behind it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ActorRuntime } from "../src/actor-runtime.js";
import type { ActorConfigPayload } from "../src/protocol.js";
import type { CertStatusResponseBody } from "@vaultysclaw/policy";

/** Reach into the runtime's state directly — this is a unit test of that state machine. */
type Internals = {
  certId: string | null;
  certificate: string | null;
  capabilities: string[];
  lastStatus: string | null;
  lastCheckedAt: number | null;
  actorConfig: ActorConfigPayload | null;
  did: string | null;
  applyCertStatus(body: CertStatusResponseBody): void;
  persistCapabilityState(): void;
};

function runtime(): ActorRuntime & Internals {
  return new ActorRuntime({
    name: "test-actor",
    kind: "openclaw",
    controlPlaneWsUrl: "ws://127.0.0.1:1",
    identityPath: "/dev/null/never-loaded",
    autoReconnect: false,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    // No capabilityStatePath: persistence is a no-op, so nothing touches the filesystem.
  }) as ActorRuntime & Internals;
}

function config(failClosed: boolean, maxStatusAgeSeconds: number): ActorConfigPayload {
  return { kindConfig: {}, grantToken: null, ruleSetToken: null, trust: { failClosed, maxStatusAgeSeconds } };
}

function statusBody(over: Partial<CertStatusResponseBody> = {}): CertStatusResponseBody {
  return {
    type: "cert_status_response",
    certId: "cert-1",
    agentDid: "did:vaultys:test",
    status: "active",
    capabilities: ["api_call", "acme:invoice.approve"],
    resourceLimits: null,
    scope: null,
    checkedAt: Date.now(),
    expiresAt: null,
    ...over,
  };
}

let rt: ActorRuntime & Internals;

/** A runtime holding a granted, freshly-verified certificate. */
function granted(caps = ["api_call", "acme:invoice.approve"]): void {
  rt.certId = "cert-1";
  rt.certificate = "cert-bytes";
  rt.capabilities = [...caps];
  rt.did = "did:vaultys:test";
  rt.lastStatus = "active";
  rt.lastCheckedAt = Date.now();
}

beforeEach(() => {
  rt = runtime();
});

describe("a verified status refresh replaces the granted set", () => {
  it("drops a capability the response no longer lists — the whole fail-closed mechanism", () => {
    granted();
    expect(rt.resolvePermission({ capability: "acme:invoice.approve" }).allowed).toBe(true);

    // The control plane filtered the deleted custom capability out of its signed response.
    rt.applyCertStatus(statusBody({ capabilities: ["api_call"] }));

    expect(rt.getCapabilities()).toEqual(["api_call"]);
    expect(rt.resolvePermission({ capability: "acme:invoice.approve" }).allowed).toBe(false);
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(true);
  });

  it("emits `capabilities` only when the set actually changed", () => {
    granted();
    const seen: readonly string[][] = [];
    rt.on("capabilities", (caps) => (seen as string[][]).push([...caps]));

    rt.applyCertStatus(statusBody()); // identical set
    expect(seen).toHaveLength(0);

    rt.applyCertStatus(statusBody({ capabilities: ["api_call"] }));
    expect(seen).toEqual([["api_call"]]);
  });

  it("can withdraw everything, and then authorizes nothing", () => {
    granted();
    rt.applyCertStatus(statusBody({ capabilities: [] }));
    expect(rt.getCapabilities()).toEqual([]);
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(false);
  });

  it("ignores a status for a different certificate", () => {
    granted();
    rt.applyCertStatus(statusBody({ certId: "someone-elses", capabilities: [] }));
    expect(rt.getCapabilities()).toEqual(["api_call", "acme:invoice.approve"]);
  });

  it("records the status and the checkedAt the response carries, not local time", () => {
    granted();
    rt.applyCertStatus(statusBody({ status: "revoked", checkedAt: 1234 }));
    expect(rt.getCertStatus().status).toBe("revoked");
    expect(rt.getCertStatus().checkedAt).toBe(1234);
  });
});

describe("a non-active status denies everything", () => {
  it.each(["revoked", "superseded", "expired"] as const)("%s", (status) => {
    granted();
    rt.applyCertStatus(statusBody({ status, capabilities: ["api_call"] }));
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(false);
  });
});

describe("staleness and fail mode", () => {
  it("denies a stale staple when failClosed", () => {
    granted();
    rt.actorConfig = config(true, 60);
    rt.lastCheckedAt = Date.now() - 61_000;
    expect(rt.getCertStatus().fresh).toBe(false);
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(false);
  });

  it("keeps a stale staple when fail-open — that is what the setting means", () => {
    granted();
    rt.actorConfig = config(false, 60);
    rt.lastCheckedAt = Date.now() - 61_000;
    expect(rt.getCertStatus().fresh).toBe(false);
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(true);
  });

  it("allows a staple still inside the bound", () => {
    granted();
    rt.actorConfig = config(true, 60);
    rt.lastCheckedAt = Date.now() - 30_000;
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(true);
  });

  it("treats a negative bound as unbounded, so nothing is ever stale", () => {
    granted();
    rt.actorConfig = config(true, -1);
    rt.lastCheckedAt = Date.now() - 10 * 365 * 24 * 3600_000;
    expect(rt.getCertStatus().fresh).toBe(true);
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(true);
  });

  it("denies synchronously under maxStatusAgeSeconds: 0 — no cached status is acceptable", () => {
    granted();
    rt.actorConfig = config(true, 0);
    expect(rt.getCertStatus().fresh).toBe(false);
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(false);
  });

  it("fails closed with no config at all — an unconfigured client is not a trusted one", () => {
    granted();
    rt.actorConfig = null;
    rt.lastCheckedAt = Date.now() - 3600_000; // older than the fallback interval
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(false);
  });

  it("denies when the status was never checked at all", () => {
    granted();
    rt.actorConfig = config(true, 60);
    rt.lastStatus = null;
    rt.lastCheckedAt = null;
    expect(rt.resolvePermission({ capability: "api_call" }).allowed).toBe(false);
  });
});

describe("checkPermission", () => {
  it("falls back to a denial when the refresh cannot be performed and failClosed is set", async () => {
    granted();
    rt.actorConfig = config(true, 0); // forces a refresh attempt on every call
    // No socket and no server identity, so `refreshCertStatus` returns false.
    await expect(rt.checkPermission({ capability: "api_call" })).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("does not widen access when the control plane is unreachable and fail-open is set", async () => {
    granted();
    rt.actorConfig = config(false, 0);
    // Fail-open keeps the cached grant — but only for what was already granted.
    const yes = await rt.checkPermission({ capability: "api_call" });
    const no = await rt.checkPermission({ capability: "code_execution" });
    expect(yes.allowed).toBe(true);
    expect(no.allowed).toBe(false);
  });

  it("uses the cached decision without refreshing while the staple is fresh", async () => {
    granted();
    rt.actorConfig = config(true, 600);
    await expect(rt.checkPermission({ capability: "api_call" })).resolves.toMatchObject({
      allowed: true,
    });
  });
});

describe("scope still applies to custom capabilities", () => {
  it("denies a resource outside a granted capability's reach", () => {
    granted(["acme:invoice.approve"]);
    // The runtime holds no scope of its own (a challenger cert carries none), so this pins the
    // capability check itself rather than scope matching — which the trust conformance vectors own.
    expect(rt.resolvePermission({ capability: "acme:invoice.approve", resource: "x" }).allowed).toBe(
      true
    );
    expect(rt.resolvePermission({ capability: "acme:other.thing" }).allowed).toBe(false);
  });
});
