"use client";

/**
 * Dev-mode login — the browser performs the VaultysId SRP handshake itself,
 * using a software identity generated and persisted in localStorage, instead
 * of a physical wallet app scanning a QR code. Ported from
 * packages/control-plane's `lib/browser-connect.ts`, trimmed to the software
 * identity path only (no PASSKEY/HARDWARE — those need a real WebAuthn
 * authenticator, not a dev convenience).
 *
 * Reuses the exact same Challenger primitive as every other login path; only
 * the transport differs (plain HTTP POSTs via BrowserChannel against
 * /api/public/user/request, not WebRTC/PeerJS).
 */

import { BrowserChannel } from "@vaultys/channel-browser";
import { Challenger, VaultysId, crypto } from "@vaultys/id";

const Buffer = crypto.Buffer;

export interface BrowserIdData {
  did: string;
  vid: string; // base64 public key
  secret: string; // base64 secret
}

const USER_ID_KEY = "vaultysclaw:devLoginVid";

export const SERVER_URL = typeof window !== "undefined" ? window.location.origin : "";

export function getStoredDevIdentity(): BrowserIdData | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(USER_ID_KEY);
  return raw ? (JSON.parse(raw) as BrowserIdData) : null;
}

export async function generateDevIdentity(): Promise<BrowserIdData> {
  const vaultysId = (await VaultysId.generateMachine()).toVersion(1);
  const data: BrowserIdData = {
    did: vaultysId.did,
    vid: Buffer.from(vaultysId.id).toString("base64"),
    secret: vaultysId.getSecret("base64"),
  };
  localStorage.setItem(USER_ID_KEY, JSON.stringify(data));
  return data;
}

/** Runs the two-round Challenger SRP exchange over `channel`, acting as the wallet/initiator. */
async function srp(channel: BrowserChannel, vaultysId: VaultysId, service = "auth"): Promise<void> {
  const challenger = new Challenger(vaultysId);
  challenger.createChallenge("p2p", service, 0);
  const cert = challenger.getCertificate();
  if (!cert) {
    channel.close();
    throw new Error("Failed to create challenge");
  }
  channel.send(cert);
  const serverCert = await channel.receive();
  await challenger.update(serverCert);
  if (challenger.isComplete()) {
    const finalCert = challenger.getCertificate();
    if (!finalCert) throw new Error("No final certificate");
    // `send` awaits the full POST/response round-trip, so by the time this resolves the server
    // has already persisted whatever this round was for (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b) —
    // the response body itself isn't needed, unlike the first round's.
    await channel.send(finalCert);
  } else {
    throw new Error("Challenge not complete after two rounds");
  }
}

/**
 * Authenticates the browser directly against the control plane, without a
 * physical wallet. Reuses (or generates) a persisted software identity, then
 * drives the SRP exchange against /api/public/user/request using `key`.
 * The caller is expected to already be polling /api/public/user/listen/[token]
 * — this only completes the server-side certificate, it does not poll.
 */
export async function connectWithoutApp(key: string): Promise<void> {
  const identity = getStoredDevIdentity() ?? (await generateDevIdentity());
  const vaultysId = VaultysId.fromSecret(identity.secret, "base64").toVersion(1);
  const channel = new BrowserChannel(`${SERVER_URL}/api/public/user/request`, key);
  await srp(channel, vaultysId);
}

/**
 * The second SRP of the dev-mode bootstrap's double-SRP flow
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b): after the login round completes
 * and `/api/public/user/listen/[token]` reports a `certRound`, the browser
 * runs this — same software identity, same transport, `service: "certificate"`
 * instead of `"auth"` — to actually co-sign the `admin_console_access` grant.
 * Resolving means the certificate is already persisted (see `srp`'s final
 * `await`); there's nothing further to poll for this round.
 */
export async function completeCertificateRound(key: string): Promise<void> {
  const identity = getStoredDevIdentity();
  if (!identity) throw new Error("No stored dev identity — can't run the certificate round");
  const vaultysId = VaultysId.fromSecret(identity.secret, "base64").toVersion(1);
  const channel = new BrowserChannel(`${SERVER_URL}/api/public/user/request`, key);
  await srp(channel, vaultysId, "certificate");
}
