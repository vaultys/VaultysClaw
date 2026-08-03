/**
 * Unit tests for the capability request/grant and cert-status wrappers
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2, §4.1).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { VaultysId, crypto } from "@vaultys/id";
import {
  signCapabilityRequestCert,
  verifyCapabilityRequestCert,
  signCapabilityGrantCert,
  verifyCapabilityGrantCert,
  signCertStatusRequestCert,
  verifyCertStatusRequestCert,
  signCertStatusResponseCert,
  verifyCertStatusResponseCert,
} from "../src/index";

const Buf = crypto.Buffer;

let agent: VaultysId; // holds the secret for the requesting agent
let agentPub: VaultysId;
let controlPlane: VaultysId; // holds the secret for the control plane
let controlPlanePub: VaultysId;

beforeAll(async () => {
  agent = await VaultysId.generateMachine();
  agentPub = VaultysId.fromId(Buf.from(agent.id));
  controlPlane = await VaultysId.generateMachine();
  controlPlanePub = VaultysId.fromId(Buf.from(controlPlane.id));
});

describe("capability request certs", () => {
  it("signs and verifies a request against the requesting agent's key", async () => {
    const token = await signCapabilityRequestCert(agent, {
      agentDid: "did:agent:1",
      requestedCapabilities: ["file_access"],
      requestedScope: { resource: "file:///reports/q3.pdf" },
      nonce: "n1",
    });
    const body = verifyCapabilityRequestCert(agentPub, token);
    expect(body).not.toBeNull();
    expect(body!.type).toBe("capability_request");
    expect(body!.requestedCapabilities).toEqual(["file_access"]);
    expect(body!.requestedScope).toEqual({ resource: "file:///reports/q3.pdf" });
  });

  it("rejects verification under the wrong key", async () => {
    const token = await signCapabilityRequestCert(agent, {
      agentDid: "did:agent:1",
      requestedCapabilities: ["file_access"],
      nonce: "n2",
    });
    expect(verifyCapabilityRequestCert(controlPlanePub, token)).toBeNull();
  });
});

describe("capability grant certs — the co-signature", () => {
  it("embeds the agent's own signed request inside the control-plane-signed grant", async () => {
    const requestCert = await signCapabilityRequestCert(agent, {
      agentDid: "did:agent:1",
      requestedCapabilities: ["file_access"],
      nonce: "n3",
    });

    const grantToken = await signCapabilityGrantCert(controlPlane, {
      certId: "cert-1",
      agentDid: "did:agent:1",
      grantedCapabilities: ["file_access"],
      requestCert,
      expiresAt: Date.now() + 3600_000,
    });

    // Anyone holding only the control plane's public key can verify the grant.
    const grantBody = verifyCapabilityGrantCert(controlPlanePub, grantToken);
    expect(grantBody).not.toBeNull();
    expect(grantBody!.type).toBe("capability_grant");
    expect(grantBody!.grantedCapabilities).toEqual(["file_access"]);

    // Anyone who additionally wants the co-signature guarantee can unpack the
    // embedded request with the agent's own public key.
    const requestBody = verifyCapabilityRequestCert(agentPub, grantBody!.requestCert);
    expect(requestBody).not.toBeNull();
    expect(requestBody!.agentDid).toBe("did:agent:1");
    expect(requestBody!.requestedCapabilities).toEqual(["file_access"]);
  });

  it("rejects an expired grant", async () => {
    const requestCert = await signCapabilityRequestCert(agent, {
      agentDid: "a",
      requestedCapabilities: [],
      nonce: "n4",
    });
    const token = await signCapabilityGrantCert(controlPlane, {
      certId: "cert-2",
      agentDid: "a",
      grantedCapabilities: [],
      requestCert,
      expiresAt: Date.now() - 1,
    });
    expect(verifyCapabilityGrantCert(controlPlanePub, token)).toBeNull();
  });

  it("accepts expiresAt: null as never-expiring", async () => {
    const requestCert = await signCapabilityRequestCert(agent, {
      agentDid: "a",
      requestedCapabilities: [],
      nonce: "n5",
    });
    const token = await signCapabilityGrantCert(controlPlane, {
      certId: "cert-3",
      agentDid: "a",
      grantedCapabilities: ["admin_console_access"],
      requestCert,
      expiresAt: null,
    });
    const body = verifyCapabilityGrantCert(controlPlanePub, token);
    expect(body).not.toBeNull();
    expect(body!.expiresAt).toBeNull();
  });
});

describe("cert-status certs", () => {
  it("signs and verifies a status request against the requester's key", async () => {
    const token = await signCertStatusRequestCert(agent, {
      certId: "cert-1",
      requesterDid: "did:agent:1",
      nonce: "n6",
    });
    const body = verifyCertStatusRequestCert(agentPub, token);
    expect(body).not.toBeNull();
    expect(body!.certId).toBe("cert-1");
  });

  it("signs and verifies a status response against the control plane's key", async () => {
    const token = await signCertStatusResponseCert(controlPlane, {
      certId: "cert-1",
      agentDid: "did:agent:1",
      status: "active",
      capabilities: ["file_access"],
      expiresAt: Date.now() + 3600_000,
    });
    const body = verifyCertStatusResponseCert(controlPlanePub, token);
    expect(body).not.toBeNull();
    expect(body!.status).toBe("active");
  });

  it("rejects a status response older than maxAgeMs (staple TTL enforcement)", async () => {
    const token = await signCertStatusResponseCert(controlPlane, {
      certId: "cert-1",
      agentDid: "did:agent:1",
      status: "active",
      capabilities: [],
      expiresAt: null,
    });
    // Immediately valid...
    expect(verifyCertStatusResponseCert(controlPlanePub, token, 60_000)).not.toBeNull();
    // ...but rejected once "older" than the allowed staple TTL.
    expect(verifyCertStatusResponseCert(controlPlanePub, token, -1)).toBeNull();
  });
});
