/**
 * Device-link login.
 *
 * The CLI carries its own VaultysId. `login`:
 *   1. requests a device-link (POST /api/user/devices/link) and prints an
 *      invite-style URL the user opens (while logged in) to approve linking the
 *      CLI's VaultysId to their profile;
 *   2. polls until approved;
 *   3. acquires a session by driving the existing VaultysId connect/SRP login
 *      with its own (now linked) identity and completing NextAuth sign-in.
 *
 * Because the identity is linked to the user, the resulting session — and every
 * action it takes — is attributed to that user (acts "in their name").
 */

import { loadVaultysId, type Identity } from "./identity.js";
import { rawApi } from "./http.js";
import { CookieJar } from "./cookies.js";

export interface LoginResult {
  cookie: string;
  did: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 1. Device-link request + approval polling ───────────────────────────────

export interface DeviceLink {
  id: string;
  approvalUrl: string;
  expiresAt: string;
}

export async function requestDeviceLink(
  baseUrl: string,
  device: { did: string; publicKey: string; name: string }
): Promise<DeviceLink> {
  const res = await rawApi<{ id: string; expiresAt: string }>(
    baseUrl,
    "/api/user/devices/link",
    { method: "POST", body: device }
  );
  if (res.status !== 201 || !res.data?.id) {
    throw new Error(`Failed to start device link (${res.status})`);
  }
  return {
    id: res.data.id,
    approvalUrl: new URL(`/devices/link/${res.data.id}`, baseUrl).toString(),
    expiresAt: res.data.expiresAt,
  };
}

export async function pollLinkApproval(
  baseUrl: string,
  id: string,
  opts: { intervalMs?: number; maxWaitMs?: number } = {}
): Promise<void> {
  const { intervalMs = 2000, maxWaitMs = 300_000 } = opts;
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const res = await rawApi<{ status: string }>(
      baseUrl,
      `/api/user/devices/link/${id}`
    );
    const status = res.data?.status;
    if (status === "approved") return;
    if (status === "rejected") throw new Error("Link request was rejected");
    if (status === "expired") throw new Error("Link request expired");
    if (Date.now() > deadline) throw new Error("Timed out waiting for approval");
    await sleep(intervalMs);
  }
}

// ── 2. Session acquisition via the linked identity ──────────────────────────

interface SrpChannel {
  send(data: Uint8Array): void;
  receive(): Promise<Uint8Array>;
  close(): void;
}

export async function acquireSession(
  baseUrl: string,
  identity: Identity,
  opts: { pollIntervalMs?: number; maxWaitMs?: number } = {}
): Promise<LoginResult> {
  const { pollIntervalMs = 1000, maxWaitMs = 60_000 } = opts;

  // Connection (login) certificate — the linked identity is an existing user.
  const connect = await rawApi<{ key: string; token: string }>(
    baseUrl,
    "/api/user/connect",
    { query: { register: "false" } }
  );
  if (connect.status !== 200 || !connect.data?.key) {
    throw new Error(`Failed to start connection (${connect.status})`);
  }
  const { key, token } = connect.data;

  // Drive the SRP with the CLI's own (linked) identity.
  const { BrowserChannel } = await import("@vaultys/channel-browser");
  const vaultysId = loadVaultysId(identity.secret);
  const channel = new BrowserChannel(`${baseUrl}/api/user/request`, key);
  await srp(channel, vaultysId);

  // Wait for the server to mark the certificate complete.
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const listen = await rawApi<{ status: number }>(
      baseUrl,
      `/api/user/listen/${token}`
    );
    if (listen.data?.status === 2) break;
    if (listen.data?.status === -2) throw new Error("Authentication failed");
    if (Date.now() > deadline) throw new Error("Timed out authenticating");
    await sleep(pollIntervalMs);
  }

  return completeNextAuthSignIn(baseUrl, key);
}

/** Run the two-round VaultysId Challenger SRP as the initiator. */
async function srp(
  channel: SrpChannel,
  vaultysId: ReturnType<typeof loadVaultysId>
): Promise<void> {
  const { Challenger } = await import("@vaultys/id");
  const challenger = new Challenger(vaultysId);
  challenger.createChallenge("p2p", "auth", 0);
  const cert = challenger.getCertificate();
  if (!cert) {
    channel.close();
    throw new Error("Failed to create challenge");
  }
  channel.send(cert);
  const serverCert = await channel.receive();
  await challenger.update(serverCert);
  if (!challenger.isComplete()) {
    throw new Error("Challenge not complete after two rounds");
  }
  const finalCert = challenger.getCertificate();
  if (!finalCert) throw new Error("No final certificate");
  channel.send(finalCert);
}

function readSetCookies(res: Response): string[] {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

/** Exchange the cert key for a NextAuth session cookie via the credentials provider. */
export async function completeNextAuthSignIn(
  baseUrl: string,
  key: string
): Promise<LoginResult> {
  const jar = new CookieJar();

  const csrf = await rawApi<{ csrfToken: string }>(baseUrl, "/api/auth/csrf");
  jar.addSetCookies(csrf.setCookies);
  const csrfToken = csrf.data?.csrfToken;
  if (!csrfToken) throw new Error("Failed to obtain CSRF token");

  const form = new URLSearchParams({
    csrfToken,
    token: key,
    json: "true",
    callbackUrl: baseUrl,
  });
  const callbackUrl = new URL("/api/auth/callback/credentials", baseUrl).toString();
  const res = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
    },
    body: form.toString(),
    redirect: "manual",
  });
  jar.addSetCookies(readSetCookies(res));

  if (
    !jar.has("next-auth.session-token") &&
    !jar.has("__Secure-next-auth.session-token")
  ) {
    throw new Error(`Sign-in failed — no session cookie returned (status ${res.status})`);
  }

  const cookie = jar.header();
  const session = await rawApi<{ user?: { did?: string | null } }>(
    baseUrl,
    "/api/auth/session",
    { cookie }
  );
  return { cookie, did: session.data?.user?.did ?? "" };
}
