/**
 * The Go→TypeScript half of the certificate-status contract
 * (conformance/status-request-fixture.json): a `cert_status_request` signed by
 * sdk-go/grant's SignStatusRequest must pass `verifyCertStatusRequestCert` —
 * the exact check the control plane's handleCertStatusRequest runs on every
 * request. The TS→Go half (status-fixture.json) is checked in
 * sdk-go/grant/status_test.go.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { VaultysId, crypto } from "@vaultys/id";
import { verifyCertStatusRequestCert, verifyCertStatusResponseCert } from "../src/index";

const conformance = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../conformance/${name}`, import.meta.url)), "utf8"));

describe("cert_status conformance", () => {
  it("verifies a Go-signed cert_status_request and decodes every field", () => {
    const f = conformance("status-request-fixture.json");
    const requester = VaultysId.fromId(crypto.Buffer.from(f.requesterIdBase64, "base64"));
    expect(requester.did).toBe(f.requesterDid);

    const body = verifyCertStatusRequestCert(requester, f.token);
    expect(body).toEqual(f.expectedBody);
    // A number, not a bigint: Go encodes issuedAt as int64, and the server
    // compares and stores it as a JS number.
    expect(typeof body!.issuedAt).toBe("number");
  });

  it("refuses the Go-signed request against any other key", async () => {
    const f = conformance("status-request-fixture.json");
    const other = await VaultysId.generateMachine();
    expect(verifyCertStatusRequestCert(other, f.token)).toBeNull();
  });

  it("does not accept a status response as a request, or the reverse", () => {
    const req = conformance("status-request-fixture.json");
    const resp = conformance("status-fixture.json");
    const requester = VaultysId.fromId(crypto.Buffer.from(req.requesterIdBase64, "base64"));
    const server = VaultysId.fromId(crypto.Buffer.from(resp.serverIdBase64, "base64"));
    expect(verifyCertStatusResponseCert(requester, req.token)).toBeNull();
    expect(verifyCertStatusRequestCert(server, resp.token)).toBeNull();
    expect(verifyCertStatusResponseCert(server, resp.token)).toEqual(resp.expectedBody);
  });
});
