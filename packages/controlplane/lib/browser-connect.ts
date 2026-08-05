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
 *
 * Multiple identities can be stored side by side (not just one) so testing as
 * different humans — admin vs. a freshly invited user, say — doesn't require
 * destroying the previous identity first. `DevIdentityPicker.tsx` is the UI
 * for choosing between them; everything here is just the storage + connect
 * primitives it and the login/invite pages call into.
 */

import { BrowserChannel } from "@vaultys/channel-browser";
import { Challenger, VaultysId, crypto } from "@vaultys/id";

const Buffer = crypto.Buffer;

export interface BrowserIdData {
  did: string;
  vid: string; // base64 public key
  secret: string; // base64 secret
}

const IDENTITIES_KEY = "vaultysclaw:devIdentities";
const ACTIVE_KEY = "vaultysclaw:activeDevIdentityDid";
/** Pre-multi-identity storage key — migrated into IDENTITIES_KEY once, on first read. */
const LEGACY_KEY = "vaultysclaw:devLoginVid";

export const SERVER_URL = typeof window !== "undefined" ? window.location.origin : "";

function readIdentities(): BrowserIdData[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(IDENTITIES_KEY);
  const list: BrowserIdData[] = raw ? JSON.parse(raw) : [];

  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw) {
    const legacy = JSON.parse(legacyRaw) as BrowserIdData;
    if (!list.some((i) => i.did === legacy.did)) list.push(legacy);
    localStorage.setItem(IDENTITIES_KEY, JSON.stringify(list));
    localStorage.removeItem(LEGACY_KEY);
  }
  return list;
}

function persistIdentities(list: BrowserIdData[]): void {
  localStorage.setItem(IDENTITIES_KEY, JSON.stringify(list));
}

function upsertIdentity(data: BrowserIdData): void {
  persistIdentities([...readIdentities().filter((i) => i.did !== data.did), data]);
}

function setActiveIdentity(did: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_KEY, did);
}

function getActiveIdentity(): BrowserIdData | null {
  if (typeof localStorage === "undefined") return null;
  const did = localStorage.getItem(ACTIVE_KEY);
  return (did && readIdentities().find((i) => i.did === did)) || null;
}

/** Every VaultysID this browser has generated for dev-mode login so far. */
export function listStoredDevIdentities(): BrowserIdData[] {
  return readIdentities();
}

export function removeStoredDevIdentity(did: string): void {
  persistIdentities(readIdentities().filter((i) => i.did !== did));
}

export async function generateDevIdentity(): Promise<BrowserIdData> {
  const vaultysId = (await VaultysId.generateMachine()).toVersion(1);
  const data: BrowserIdData = {
    did: vaultysId.did,
    vid: Buffer.from(vaultysId.id).toString("base64"),
    secret: vaultysId.getSecret("base64"),
  };
  upsertIdentity(data);
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
 * physical wallet, using `identity` — a specific stored VaultysID (picked via
 * `DevIdentityPicker`), the literal string `"new"` to generate a fresh one, or
 * omitted entirely to fall back to whichever identity was used most recently
 * (or the first stored one, or a freshly generated one if none exist yet) —
 * the same one-click behavior this had before multiple identities existed.
 * The caller is expected to already be polling /api/public/user/listen/[token]
 * — this only completes the server-side certificate, it does not poll.
 */
export async function connectWithoutApp(key: string, identity?: BrowserIdData | "new"): Promise<void> {
  const chosen =
    identity === "new"
      ? await generateDevIdentity()
      : identity ?? getActiveIdentity() ?? readIdentities()[0] ?? (await generateDevIdentity());
  setActiveIdentity(chosen.did);
  const vaultysId = VaultysId.fromSecret(chosen.secret, "base64").toVersion(1);
  const channel = new BrowserChannel(`${SERVER_URL}/api/public/user/request`, key);
  await srp(channel, vaultysId);
}

/**
 * The second SRP of the dev-mode bootstrap's double-SRP flow
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b): after the login round completes
 * and `/api/public/user/listen/[token]` reports a `certRound`, the browser
 * runs this — same software identity `connectWithoutApp` just used (tracked
 * as "active" above, not just "whatever's stored"), same transport,
 * `service: "certificate"` instead of `"auth"` — to actually co-sign the
 * `admin_console_access` grant. Resolving means the certificate is already
 * persisted (see `srp`'s final `await`); there's nothing further to poll for
 * this round.
 */
export async function completeCertificateRound(key: string): Promise<void> {
  const identity = getActiveIdentity();
  if (!identity) throw new Error("No active dev identity — can't run the certificate round");
  const vaultysId = VaultysId.fromSecret(identity.secret, "base64").toVersion(1);
  const channel = new BrowserChannel(`${SERVER_URL}/api/public/user/request`, key);
  await srp(channel, vaultysId, "certificate");
}
