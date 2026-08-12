/**
 * SSO connection helpers: issuer normalization, OIDC discovery, and the one
 * place a connection's client secret is decrypted.
 *
 * Entra ID is deliberately not a second protocol — it is an OIDC IdP whose
 * issuer is a function of the tenant, so the whole "Azure AD integration" is
 * {@link entraIssuer} plus a different set of form fields. Everything downstream
 * (discovery, the NextAuth provider, identity binding) is shared.
 */
import { SsoConnectionDAO } from "@/db";
import { decryptSecret } from "./vault";
import type { SsoConnection } from "@prisma/client";

export type SsoKind = "oidc" | "entra";

export function isSsoKind(value: string): value is SsoKind {
  return value === "oidc" || value === "entra";
}

/** Microsoft's v2.0 issuer for a tenant. `common`/`organizations` are accepted as
 *  tenant values for multi-tenant apps, exactly as Microsoft documents them. */
export function entraIssuer(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId.trim()}/v2.0`;
}

/**
 * Tolerate the two things admins actually paste: a trailing slash, and the full
 * discovery URL copied straight from their IdP's docs. Ported from
 * packages/control-plane's `normalizeIssuer` — the same two mistakes, so the same
 * two fixes.
 */
export function normalizeIssuer(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/\.well-known\/openid-configuration$/, "");
}

export function discoveryUrl(issuer: string): string {
  return `${normalizeIssuer(issuer)}/.well-known/openid-configuration`;
}

export interface DiscoveryResult {
  ok: boolean;
  error?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
}

/**
 * Fetch and sanity-check the IdP's discovery document. Never throws — this backs
 * a "Test connection" button, where "couldn't reach it" is a displayable answer
 * rather than an exception. Checks the three endpoints the authorization-code +
 * PKCE flow actually needs, so a document that resolves but is unusable still
 * fails here rather than at a user's first login.
 */
export async function testDiscovery(issuer: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch(discoveryUrl(issuer), { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { ok: false, error: `Discovery returned HTTP ${res.status}` };
    const doc = (await res.json()) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
      jwks_uri?: string;
    };
    const missing = [
      !doc.authorization_endpoint && "authorization_endpoint",
      !doc.token_endpoint && "token_endpoint",
      !doc.jwks_uri && "jwks_uri",
    ].filter(Boolean);
    if (missing.length > 0) {
      return { ok: false, error: `Discovery document is missing ${missing.join(", ")}` };
    }
    return {
      ok: true,
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      jwksUri: doc.jwks_uri,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unreachable" };
  }
}

/** The NextAuth provider id for a connection — also what the callback URL ends
 *  with, which is why it must be stable for the lifetime of the connection. */
export function providerIdFor(connection: Pick<SsoConnection, "id">): string {
  return `sso-${connection.id}`;
}

/** The redirect URI an admin has to register at the IdP. Shown in the UI, since
 *  a mismatch here is the single most common reason a new connection fails. */
export function callbackUrlFor(connection: Pick<SsoConnection, "id">): string {
  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  return `${base}/api/auth/callback/${providerIdFor(connection)}`;
}

export interface ResolvedConnection {
  connection: SsoConnection;
  clientSecret: string;
}

/**
 * Active connections with their secrets opened, for building NextAuth providers.
 * A connection whose secret can't be decrypted (e.g. the server identity was
 * regenerated under it) is **dropped with a log line, not thrown** — one broken
 * connection must not take down the whole login page, including the VaultysId
 * path that doesn't depend on it at all.
 */
export async function resolveActiveConnections(): Promise<ResolvedConnection[]> {
  const connections = await SsoConnectionDAO.listActive();
  const resolved: ResolvedConnection[] = [];
  for (const connection of connections) {
    try {
      resolved.push({ connection, clientSecret: await decryptSecret(connection.clientSecretEnc) });
    } catch (err) {
      console.error("[sso] could not decrypt client secret for connection", connection.id, err);
    }
  }
  return resolved;
}
