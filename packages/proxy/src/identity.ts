/**
 * Request identity resolution — the two paths a proxy authorizes requests by.
 *
 * Self-signed: the caller already holds a VaultysId and embeds its public
 * identity + a signature over this specific request in the X-VAULTYSID
 * header. Verification is fully offline — the DID is derived from the
 * embedded key, so no control-plane round trip is needed.
 *
 * Proxy-provisioned: no header at all (the common case — the fronted service
 * was never written to be VaultysId-aware). The proxy mints and durably owns
 * a VaultysId on the extracted principal id's behalf (see local-db.ts).
 *
 * Both reuse @vaultysclaw/policy's existing signed-cert envelope
 * (signCert/openCert over packCert) rather than inventing a new wire format.
 */
import { VaultysId, crypto } from "@vaultys/id";
import { signCert, openCert } from "@vaultysclaw/policy";
import { createHash } from "node:crypto";

const Buf = crypto.Buffer;

/** Reject a signed request whose timestamp has drifted more than this. */
const MAX_SKEW_MS = 5 * 60_000;

interface RequestBinding {
  method: string;
  url: string;
  timestamp: number;
  bodyHash: string;
}

export function hashBody(body: string | Buffer | undefined): string {
  return createHash("sha256")
    .update(body ?? "")
    .digest("hex");
}

/** Build an `X-VAULTYSID` header value: `<base64url id>.<packCert token>`. */
export async function signRequest(
  vid: VaultysId,
  method: string,
  url: string,
  body: string | Buffer | undefined
): Promise<string> {
  const binding: RequestBinding = {
    method: method.toUpperCase(),
    url,
    timestamp: Date.now(),
    bodyHash: hashBody(body),
  };
  const token = await signCert(vid, binding);
  const idB64 = Buf.from(vid.id).toString("base64url");
  return `${idB64}.${token}`;
}

/**
 * Verify a self-signed `X-VAULTYSID` header fully offline. Returns the
 * signer's DID on success, or `null` if the header is malformed, the
 * signature doesn't check out, the binding doesn't match this exact request,
 * or the timestamp has drifted too far.
 */
export function verifySelfSignedHeader(
  header: string,
  method: string,
  url: string,
  body: string | Buffer | undefined
): string | null {
  const dotIdx = header.indexOf(".");
  if (dotIdx === -1) return null;
  const idB64 = header.slice(0, dotIdx);
  const token = header.slice(dotIdx + 1);

  let vid: VaultysId;
  try {
    vid = VaultysId.fromId(Buf.from(idB64, "base64url"));
  } catch {
    return null;
  }

  const decoded = openCert(vid, token) as RequestBinding | null;
  if (!decoded) return null;
  if (decoded.method !== method.toUpperCase()) return null;
  if (decoded.url !== url) return null;
  if (decoded.bodyHash !== hashBody(body)) return null;
  if (Math.abs(Date.now() - decoded.timestamp) > MAX_SKEW_MS) return null;

  return vid.did;
}

/** Mint a fresh VaultysId for a newly-seen, unsigned principal id. */
export async function provisionIdentity(): Promise<VaultysId> {
  return VaultysId.generateMachine();
}
