import { describe, it, expect } from "vitest";
import type { KillSwitch } from "@prisma/client";
import {
  killSwitchReason,
  resolveCertStatus,
  suppressionFor,
  suppressionForActor,
  type KillSwitchState,
} from "@/lib/kill-switch";

const row = (over: Partial<KillSwitch> = {}): KillSwitch =>
  ({
    id: "global",
    scopeType: "global",
    workspaceId: null,
    reason: "incident",
    armedBy: "did:vaultys:admin",
    armedAt: new Date("2026-07-17T10:00:00.000Z"),
    ...over,
  }) as KillSwitch;

const globalArmed: KillSwitchState = { global: row(), byWorkspace: new Map() };
const wsArmed = (id: string): KillSwitchState => ({
  global: null,
  byWorkspace: new Map([[id, row({ id, scopeType: "workspace", workspaceId: id })]]),
});
const disarmed: KillSwitchState = { global: null, byWorkspace: new Map() };

const agent = { kind: "openclaw", workspaceId: null };
const cert = { workspaceId: null, scope: null };

describe("suppressionFor", () => {
  it("never suspends a human, even under the global switch", () => {
    // The lockout this exists to prevent: `admin_console_access` is itself a
    // capability carried by a certificate, and the console is the only way to
    // disarm. If this ever starts returning a row, arming the global switch
    // becomes unrecoverable through the UI.
    expect(suppressionFor(cert, { kind: "human", workspaceId: null }, globalArmed)).toBeNull();
    expect(suppressionFor(cert, { kind: "human", workspaceId: "w1" }, wsArmed("w1"))).toBeNull();
  });

  it("suspends every non-human kind under the global switch", () => {
    for (const kind of ["openclaw", "mcp", "sensor", "device", "proxy", "harness"]) {
      expect(suppressionFor(cert, { kind, workspaceId: null }, globalArmed)).not.toBeNull();
    }
  });

  it("suspends nothing when nothing is armed", () => {
    expect(suppressionFor(cert, agent, disarmed)).toBeNull();
  });

  it("matches a workspace switch through the certificate's own workspaceId", () => {
    expect(suppressionFor({ workspaceId: "w1", scope: null }, agent, wsArmed("w1"))).not.toBeNull();
  });

  it("matches a workspace switch through a workspace-scoped CertScope", () => {
    // The same pairing `WorkspaceDAO.listActiveScopedCertificates` matches on.
    const scoped = { workspaceId: null, scope: { resource: "workspace:w1" } };
    expect(suppressionFor(scoped, agent, wsArmed("w1"))).not.toBeNull();
  });

  it("matches a workspace switch through the holder's own assignment", () => {
    // The deliberate widening over the delete path: a certificate carrying no
    // workspace of its own, held by an Actor filed under the armed workspace,
    // must still fall. A kill switch over-includes on purpose.
    expect(suppressionFor(cert, { kind: "openclaw", workspaceId: "w1" }, wsArmed("w1"))).not.toBeNull();
  });

  it("leaves other workspaces alone", () => {
    expect(suppressionFor({ workspaceId: "w2", scope: null }, agent, wsArmed("w1"))).toBeNull();
    expect(
      suppressionFor({ workspaceId: null, scope: { resource: "workspace:w2" } }, agent, wsArmed("w1"))
    ).toBeNull();
    expect(suppressionFor(cert, { kind: "openclaw", workspaceId: "w2" }, wsArmed("w1"))).toBeNull();
  });

  it("ignores a non-workspace CertScope resource", () => {
    const scoped = { workspaceId: null, scope: { resource: "file:///reports/q3.pdf" } };
    expect(suppressionFor(scoped, agent, wsArmed("w1"))).toBeNull();
  });

  it("returns the row, so the caller can report the admin's reason", () => {
    const found = suppressionFor(cert, agent, globalArmed);
    expect(found?.reason).toBe("incident");
  });
});

describe("suppressionForActor", () => {
  it("decides without a certificate, for the handshake and issuance gates", () => {
    expect(suppressionForActor({ kind: "openclaw", workspaceId: "w1" }, wsArmed("w1"))).not.toBeNull();
    expect(suppressionForActor({ kind: "human", workspaceId: "w1" }, wsArmed("w1"))).toBeNull();
    expect(suppressionForActor({ kind: "openclaw", workspaceId: null }, wsArmed("w1"))).toBeNull();
    expect(suppressionForActor({ kind: "openclaw", workspaceId: null }, globalArmed)).not.toBeNull();
  });
});

describe("killSwitchReason", () => {
  it("names the scope and carries the admin's words through to the client", () => {
    expect(killSwitchReason(row())).toBe("Kill switch armed (org-wide): incident");
    expect(killSwitchReason(row({ id: "w1", scopeType: "workspace", workspaceId: "w1" }))).toBe(
      "Kill switch armed (workspace w1): incident"
    );
  });
});

describe("resolveCertStatus", () => {
  const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
  const registry = new Set(["acme:invoice.approve"]);
  const stored = {
    status: "active",
    capabilities: ["file_read", "acme:invoice.approve"],
    workspaceId: null,
    scope: null,
    expiresAt: NOW + 3_600_000,
  };

  it("reports a suspended certificate as revoked while its row still says active", () => {
    // The invariant the whole feature rests on. `stored.status` is untouched —
    // no ledger write happens anywhere in this path — but what gets signed, and
    // therefore what the holder keeps, says revoked.
    const got = resolveCertStatus(stored, agent, globalArmed, registry, NOW);
    expect(got.status).toBe("revoked");
    expect(got.capabilities).toEqual([]);
    expect(stored.status).toBe("active");
  });

  it("leaves a human's certificate entirely alone under the same armed switch", () => {
    const got = resolveCertStatus(stored, { kind: "human", workspaceId: null }, globalArmed, registry, NOW);
    expect(got.status).toBe("active");
    expect(got.capabilities).toEqual(["file_read", "acme:invoice.approve"]);
  });

  it("reports the row's real status when nothing is armed", () => {
    const got = resolveCertStatus(stored, agent, disarmed, registry, NOW);
    expect(got.status).toBe("active");
    expect(got.capabilities).toEqual(["file_read", "acme:invoice.approve"]);
  });

  it("still overlays expiry, which no sweep writes to the row", () => {
    const got = resolveCertStatus({ ...stored, expiresAt: NOW - 1 }, agent, disarmed, registry, NOW);
    expect(got.status).toBe("expired");
  });

  it("suspension wins over expiry rather than masking it into silence", () => {
    const got = resolveCertStatus({ ...stored, expiresAt: NOW - 1 }, agent, globalArmed, registry, NOW);
    expect(got.status).toBe("revoked");
  });

  it("keeps the registry filter's own rule: active with nothing on it, not revoked", () => {
    // Deliberately the opposite of the kill switch's rule above. Deleting a
    // custom capability must not be reported as a revocation, because the ledger
    // row genuinely is still active — only its contents shrank.
    const got = resolveCertStatus(
      { ...stored, capabilities: ["acme:deleted"] },
      agent,
      disarmed,
      registry,
      NOW
    );
    expect(got.status).toBe("active");
    expect(got.capabilities).toEqual([]);
  });

  it("suspends a certificate reached only through its workspace scope", () => {
    const scoped = { ...stored, scope: { resource: "workspace:w1" } };
    expect(resolveCertStatus(scoped, agent, wsArmed("w1"), registry, NOW).status).toBe("revoked");
    expect(resolveCertStatus(scoped, agent, wsArmed("w2"), registry, NOW).status).toBe("active");
  });

  it("preserves a row that was genuinely revoked, armed or not", () => {
    const revoked = { ...stored, status: "revoked" };
    expect(resolveCertStatus(revoked, agent, disarmed, registry, NOW).status).toBe("revoked");
    expect(resolveCertStatus(revoked, agent, globalArmed, registry, NOW).status).toBe("revoked");
  });
});
