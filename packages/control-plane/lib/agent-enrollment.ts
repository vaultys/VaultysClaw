import crypto from "crypto";

/**
 * Stateless, signed agent-enrollment tokens.
 *
 * When a user creates a "local AI" agent from the My Agents page, we bind the
 * self-registering agent to that user and their personal workspace by handing
 * out a short-lived HMAC-signed token embedded in the WebSocket URL
 * (`ws://…?enroll=<token>`). The control-plane verifies it at connection time
 * — no DB table, no round-trip. See app/api/(user)/agents/enrollment/route.ts
 * (issuer) and lib/ws-server.ts (verifier).
 */

export interface EnrollmentClaims {
  userId: string;
  workspaceId: string;
}

interface TokenPayload {
  uid: string;
  ws: string;
  exp: number; // epoch seconds
}

const DEFAULT_TTL_SEC = 30 * 60; // 30 minutes

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret)
    throw new Error("NEXTAUTH_SECRET is required to sign enrollment tokens");
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(data: string): string {
  return b64url(crypto.createHmac("sha256", getSecret()).update(data).digest());
}

/** Create a signed enrollment token valid for `ttlSec` seconds. */
export function signEnrollmentToken(
  claims: EnrollmentClaims,
  ttlSec: number = DEFAULT_TTL_SEC
): string {
  const payload: TokenPayload = {
    uid: claims.userId,
    ws: claims.workspaceId,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
}

/**
 * Verify a token; returns the claims when the signature is valid and the token
 * is not expired, otherwise `null`. Never throws on malformed input.
 */
export function verifyEnrollmentToken(
  token: string | null | undefined
): EnrollmentClaims | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null; // secret missing
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as TokenPayload;
    if (
      !payload ||
      typeof payload.uid !== "string" ||
      typeof payload.ws !== "string" ||
      typeof payload.exp !== "number"
    )
      return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.uid, workspaceId: payload.ws };
  } catch {
    return null;
  }
}
