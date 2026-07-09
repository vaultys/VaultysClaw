/**
 * Signed-certificate wire codec.
 *
 * Every server-signed blob in VaultysClaw (intent signatures, delegation certs,
 * peer-grant certs) shares one binary envelope:
 *
 *   base64( 4-byte-LE bodyLen | msgpack(body) | raw-signature )
 *
 * This module is the single implementation of that pack/unpack format. Higher
 * layers (`sign.ts` and the typed wrappers) build on it so the format lives in
 * exactly one place.
 */
import { crypto } from "@vaultys/id";

const Buf = crypto.Buffer;

/**
 * Pack a signed body into the base64 wire format.
 *
 * @param body       The (already msgpack-encoded) payload bytes.
 * @param signature  The raw signature bytes over `body`.
 */
export function packCert(body: Uint8Array, signature: Uint8Array): string {
  const lenBuf = Buf.allocUnsafe(4);
  lenBuf.writeUInt32LE(body.length, 0);
  return Buf.concat([lenBuf, Buf.from(body), Buf.from(signature)]).toString(
    "base64"
  );
}

/**
 * Unpack the wire format back into its body and signature segments.
 * Returns `null` if the token is too short or the declared length is
 * inconsistent with the buffer size.
 */
export function unpackCert(
  token: string
): { body: Uint8Array; signature: Uint8Array } | null {
  const combined = Buf.from(token, "base64");
  if (combined.length < 5) return null;

  const bodyLen = combined.readUInt32LE(0);
  if (combined.length < 4 + bodyLen) return null;

  return {
    body: combined.subarray(4, 4 + bodyLen),
    signature: combined.subarray(4 + bodyLen),
  };
}
