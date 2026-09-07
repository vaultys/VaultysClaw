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
  /** The `issuer` the document itself claims. Usually identical to the issuer it
   *  was fetched from — see {@link issuerMismatch} for when it is not. */
  documentIssuer?: string;
}

/**
 * Does the IdP's discovery document disagree with the URL it was fetched from?
 *
 * OpenID Connect Discovery §4.3 requires the `issuer` in the document to be
 * *identical* to the issuer used to build the request. A real IdP encountered
 * here serves discovery over `https://` and claims `http://` — the classic
 * symptom of an OIDC provider behind TLS termination that has not been told it
 * is on https.
 *
 * Reported as a **warning, never a failure**: the mismatch is the IdP's bug, not
 * the admin's, and today it happens to work, because openid-client v5 takes the
 * issuer from the document and then consistently validates the `id_token`'s
 * `iss` and the `iss` response parameter against that same value. Two reasons to
 * say so anyway: stricter clients (openid-client v6 among them) reject it
 * outright, and `SsoIdentity.issuer` records this connection's *configured*
 * issuer, which in that case is not the string the IdP actually identifies
 * itself by — weakening exactly the "a re-pointed connection can't re-bind an
 * identity from a different IdP" guarantee that column exists for.
 */
export function issuerMismatch(configuredIssuer: string, documentIssuer?: string): boolean {
  if (!documentIssuer) return false;
  return normalizeIssuer(configuredIssuer) !== normalizeIssuer(documentIssuer);
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
      issuer?: string;
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
      documentIssuer: doc.issuer,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unreachable" };
  }
}

/**
 * A client secret that is actually a URL — the mistake this check exists for.
 *
 * The Issuer URL field invites pasting a full discovery URL (it says so), and
 * that URL then sits in the clipboard right next to the Client secret field. A
 * connection saved that way passes every check that existed here — discovery
 * resolves, because the issuer is fine — and then fails at the *token* endpoint
 * with `invalid_client`, visible only in a server log, only to whoever clicks
 * the login button first. Worth catching by shape before anything is sent
 * anywhere.
 */
export function secretLooksLikeUrl(clientSecret: string): boolean {
  return /^https?:\/\//i.test(clientSecret.trim());
}

export type ClientCheckVerdict = "accepted" | "rejected" | "inconclusive";

export interface ClientCheckResult {
  verdict: ClientCheckVerdict;
  detail: string;
}

/**
 * Do these client credentials actually authenticate at the IdP's token endpoint?
 *
 * There is no standard "verify my client secret" endpoint, but RFC 6749 §5.2
 * gives a reliable discriminator: send a token request the IdP must reject, and
 * read *why* it was rejected. `invalid_client` means client authentication
 * failed; `invalid_grant` means the client authenticated fine and only the
 * (deliberately bogus) code was refused. So a deliberately invalid grant
 * separates "your secret is wrong" from "your secret is right", without needing
 * a real authorization code or a real user.
 *
 * Both `client_secret_basic` and `client_secret_post` are tried, since either
 * may be the client's registered method and openid-client picks basic by
 * default; only a rejection from *both* is treated as conclusive.
 *
 * Never throws, and returns `"inconclusive"` rather than guessing whenever the
 * IdP answers in a shape this can't read — an unreachable or non-conforming
 * token endpoint must not be reported as bad credentials, and must not block an
 * admin from saving a connection that may well be correct.
 */
export async function testClientCredentials(
  issuer: string,
  clientId: string,
  clientSecret: string
): Promise<ClientCheckResult> {
  if (secretLooksLikeUrl(clientSecret)) {
    return {
      verdict: "rejected",
      detail:
        "The client secret is a URL. That is almost always the discovery/issuer URL pasted into " +
        "the wrong field — paste the client secret your IdP issued for this application.",
    };
  }

  let tokenEndpoint: string;
  try {
    const res = await fetch(discoveryUrl(issuer), { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { verdict: "inconclusive", detail: `Discovery returned HTTP ${res.status}` };
    const doc = (await res.json()) as { token_endpoint?: string };
    if (!doc.token_endpoint) {
      return { verdict: "inconclusive", detail: "Discovery document has no token_endpoint" };
    }
    tokenEndpoint = doc.token_endpoint;
  } catch (err) {
    return {
      verdict: "inconclusive",
      detail: err instanceof Error ? err.message : "Could not reach the IdP",
    };
  }

  // Not a real redirect_uri or code: the request is *meant* to fail. A registered
  // redirect_uri is not needed, because client authentication is checked before
  // the grant is.
  const params = {
    grant_type: "authorization_code",
    code: `credential-check-${Date.now()}`,
    redirect_uri: `${(process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost").replace(/\/+$/, "")}/api/auth/callback/credential-check`,
  };

  const attempts: RequestInit[] = [
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`
          ).toString("base64"),
      },
      body: new URLSearchParams(params),
    },
    { body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }) },
  ];

  let lastDetail = "The IdP did not return a readable OAuth error";
  for (const attempt of attempts) {
    try {
      const res = await fetch(tokenEndpoint, {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        ...attempt,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          ...(attempt.headers ?? {}),
        },
      });
      const body = (await res.json()) as { error?: string; error_description?: string };
      if (!body.error) return { verdict: "inconclusive", detail: lastDetail };
      if (body.error !== "invalid_client") {
        // Authenticated well enough to get past client auth and be judged on the grant.
        return { verdict: "accepted", detail: `Client authenticated (IdP rejected the test grant with \`${body.error}\`, as expected)` };
      }
      lastDetail = body.error_description
        ? `${body.error}: ${body.error_description}`
        : body.error;
    } catch (err) {
      return {
        verdict: "inconclusive",
        detail: err instanceof Error ? err.message : "Token endpoint unreachable",
      };
    }
  }

  return {
    verdict: "rejected",
    detail:
      `The IdP rejected these credentials (${lastDetail}). Check the client ID and secret, and ` +
      `that this client is still registered and enabled at the IdP.`,
  };
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
