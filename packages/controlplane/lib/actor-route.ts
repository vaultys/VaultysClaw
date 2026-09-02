/**
 * A raw `did:vaultys:...` string is a fragile URL path segment: even
 * percent-encoded, Next's client-side router decodes it back to literal
 * colons before issuing the actual top-level navigation, and the server
 * 404s on that (confirmed by network trace — the RSC prefetch of the
 * encoded form succeeds, the real navigation request does not). Base64url
 * side-steps the ambiguity entirely instead of fighting the router over it.
 *
 * The alphabet swap is done by hand rather than with Node's `"base64url"`
 * encoding name. These helpers run in Client Components too (the world map's
 * tooltip builds actor links), and there `Buffer` is a browser polyfill that
 * implements `"base64"` but not `"base64url"` — it throws
 * `Unknown encoding: base64url` at runtime while type-checking perfectly
 * happily against Node's typings. Plain `"base64"` plus the three
 * substitutions below is understood by every implementation and produces
 * byte-identical output, so existing URLs keep resolving.
 */
export function encodeDidParam(did: string): string {
  return Buffer.from(did, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeDidParam(param: string): string {
  // Padding is not restored: both Node's Buffer and the browser polyfill accept
  // unpadded base64, and re-adding it would be one more thing to get wrong.
  return Buffer.from(param.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
