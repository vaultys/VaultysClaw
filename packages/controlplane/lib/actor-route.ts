/**
 * A raw `did:vaultys:...` string is a fragile URL path segment: even
 * percent-encoded, Next's client-side router decodes it back to literal
 * colons before issuing the actual top-level navigation, and the server
 * 404s on that (confirmed by network trace — the RSC prefetch of the
 * encoded form succeeds, the real navigation request does not). Base64url
 * side-steps the ambiguity entirely instead of fighting the router over it.
 */
export function encodeDidParam(did: string): string {
  return Buffer.from(did, "utf8").toString("base64url");
}

export function decodeDidParam(param: string): string {
  return Buffer.from(param, "base64url").toString("utf8");
}
