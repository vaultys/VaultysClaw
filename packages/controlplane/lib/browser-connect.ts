"use client";

/**
 * Browser-held VaultysId login — the browser performs the VaultysId SRP
 * handshake itself with a key it stores locally, instead of a physical wallet
 * app scanning a QR code. Ported from packages/control-plane's
 * `lib/browser-connect.ts`.
 *
 * No longer a dev-only path. It is the credential an SSO-registered human ends
 * up holding: `resolveSsoLogin` proves *who* someone is, and the binding step
 * (`app/invite/[token]?sso=1`) mints or reuses one of these keys to give that
 * person a DID. `lib/browser-bootstrap.ts` explains what *is* still dev-gated — minting
 * an identity for an anonymous caller on a deployment with no human yet — and
 * why that is a narrower gate than "this whole module".
 *
 * Reuses the exact same Challenger primitive as every other login path; only
 * the transport differs (plain HTTP POSTs via BrowserChannel against
 * /api/public/user/request, not WebRTC/PeerJS).
 *
 * Multiple identities can be stored side by side (not just one), which is what
 * the advanced-mode picker exposes — one browser standing in for several humans
 * (an admin, then a freshly invited user) without destroying the previous key
 * first. Four generation types, same set packages/control-plane's
 * `SecurityTypeSelector` offers plus one it doesn't:
 *   - "software"      — a random key generated and stored in this browser.
 *   - "software-pqc"  — same, but a post-quantum/classical hybrid key
 *                        (dilithium_ed25519) — @vaultys/id already supports this
 *                        algorithm choice; neither control-plane app actually
 *                        used it before now, it was only ever a decorative "PQC"
 *                        badge in packages/control-plane's login diagram.
 *   - "passkey"       — a real WebAuthn platform authenticator (Face ID/Touch ID).
 *   - "hardware"      — a real WebAuthn cross-platform authenticator (FIDO2 key).
 * `BrowserIdentityPicker.tsx` is the UI for choosing between stored identities or
 * generating a new one of a given type; everything here is just the storage +
 * generation + connect primitives it and the login/invite pages call into.
 */

import { BrowserChannel } from "@vaultys/channel-browser";
import { Challenger, VaultysId, crypto } from "@vaultys/id";

const Buffer = crypto.Buffer;

// The stored shape and its one repair function live in a dependency-free module
// so pure consumers (lib/identity-backup.ts and its Node tests) can use them
// without pulling in @vaultys/channel-browser. Re-exported here so existing
// importers keep working unchanged.
export { normaliseIdentity, type BrowserIdData, type BrowserIdentityType } from "./browser-identity";
import { normaliseIdentity, type BrowserIdData, type BrowserIdentityType } from "./browser-identity";

// The "dev" in these two keys is historical and deliberately kept: renaming them
// would orphan every key already in a real browser's localStorage, and there is
// no server-side copy to restore from.
const IDENTITIES_KEY = "vaultysclaw:devIdentities";
const ACTIVE_KEY = "vaultysclaw:activeDevIdentityDid";
/** Pre-multi-identity storage key — migrated into IDENTITIES_KEY once, on first read. */
const LEGACY_KEY = "vaultysclaw:devLoginVid";

export const SERVER_URL = typeof window !== "undefined" ? window.location.origin : "";

function readIdentities(): BrowserIdData[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(IDENTITIES_KEY);
  const list: BrowserIdData[] = (raw ? JSON.parse(raw) : []).map(normaliseIdentity);

  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw) {
    const legacy = JSON.parse(legacyRaw) as Partial<BrowserIdData>;
    if (!list.some((i) => i.did === legacy.did)) list.push(normaliseIdentity(legacy));
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

/** Every VaultysID this browser holds. */
export function listBrowserIdentities(): BrowserIdData[] {
  return readIdentities();
}

export function removeBrowserIdentity(did: string): void {
  persistIdentities(readIdentities().filter((i) => i.did !== did));
}

/**
 * Merge restored identities into this browser's set (see `lib/identity-backup.ts`).
 *
 * Merges rather than replaces, and skips a DID already present rather than
 * overwriting it. A restore is normally run *because* something was lost, so the
 * destructive reading of "restore" — wiping identities the backup predates — is
 * the one thing it must not do. Skipping an existing DID is safe because a DID
 * is derived from its key: same DID means same secret, so there is nothing to
 * choose between.
 */
export function importBrowserIdentities(incoming: BrowserIdData[]): {
  added: number;
  alreadyPresent: number;
} {
  const existing = readIdentities();
  const known = new Set(existing.map((i) => i.did));
  const added = incoming.filter((i) => !known.has(i.did));

  if (added.length > 0) persistIdentities([...existing, ...added]);
  return { added: added.length, alreadyPresent: incoming.length - added.length };
}

/** Ported verbatim from packages/control-plane's `getPkCred` — the only difference between a
 *  Passkey and a Hardware key request is `authenticatorAttachment`/`residentKey` below; both are
 *  real `navigator.credentials.create()` calls, not stubs. */
function getPkCred(requireResidentKey: boolean): PublicKeyCredentialCreationOptions {
  const safari = /^((?!chrome|android).)*applewebkit/i.test(navigator.userAgent);
  const challenge = new Uint8Array(32);
  const userId = new Uint8Array(16);
  globalThis.crypto.getRandomValues(challenge);
  globalThis.crypto.getRandomValues(userId);
  return {
    challenge,
    rp: { name: "VaultysClaw" },
    user: { id: userId, name: "VaultysClaw", displayName: "VaultysClaw" },
    attestation: safari ? "none" : "direct",
    authenticatorSelection: {
      authenticatorAttachment: requireResidentKey ? "platform" : "cross-platform",
      residentKey: requireResidentKey ? "required" : "discouraged",
      userVerification: "preferred",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -8 },
      { type: "public-key", alg: -257 },
    ],
  };
}

/** Generates and stores a new browser identity of the given type — "passkey"/"hardware" trigger a
 *  real WebAuthn prompt and can reject (e.g. the user cancels, or no authenticator is available);
 *  callers should expect this to throw. */
export async function generateBrowserIdentity(type: BrowserIdentityType = "software"): Promise<BrowserIdData> {
  let vaultysId: VaultysId;
  switch (type) {
    case "passkey": {
      const attestation = (await navigator.credentials.create({
        publicKey: getPkCred(true),
      })) as PublicKeyCredential;
      vaultysId = (await VaultysId.fido2FromAttestation(attestation)).toVersion(1);
      break;
    }
    case "hardware": {
      const attestation = (await navigator.credentials.create({
        publicKey: getPkCred(false),
      })) as PublicKeyCredential;
      vaultysId = (await VaultysId.fido2FromAttestation(attestation)).toVersion(1);
      break;
    }
    case "software-pqc":
      vaultysId = (await VaultysId.generateMachine("dilithium_ed25519")).toVersion(1);
      break;
    default:
      vaultysId = (await VaultysId.generateMachine()).toVersion(1);
  }
  const data: BrowserIdData = {
    did: vaultysId.did,
    vid: Buffer.from(vaultysId.id).toString("base64"),
    secret: vaultysId.getSecret("base64"),
    type,
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
 * The identity this browser should connect as when nobody has picked one:
 * whichever was used most recently, else the first stored one, else a fresh
 * software key.
 *
 * Generating on the "else" branch is what makes an SSO binding a single click —
 * a person arriving from their corporate IdP has no VaultysID yet, and asking
 * them to acquire a wallet app first is where that flow used to dead-end. Note
 * that the *storage* here is all this returns; nothing is registered with the
 * control plane until a handshake actually runs.
 */
export async function ensureBrowserIdentity(): Promise<BrowserIdData> {
  return getActiveIdentity() ?? readIdentities()[0] ?? (await generateBrowserIdentity());
}

/** Whether this browser already holds at least one VaultysID — i.e. whether
 *  "sign in with this browser" is a login rather than a registration. Sync, so
 *  a component can branch on it without an async effect. */
export function hasBrowserIdentity(): boolean {
  return readIdentities().length > 0;
}

/**
 * Authenticates the browser directly against the control plane, without a
 * physical wallet, using `identity` — a specific stored VaultysID (picked via
 * `BrowserIdentityPicker`, which resolves "generate a new one" to a concrete
 * identity itself before calling this) — or omitted entirely to fall back to
 * {@link ensureBrowserIdentity}. The caller is expected to already be polling
 * /api/public/user/listen/[token] — this only completes the server-side
 * certificate, it does not poll.
 */
export async function connectWithBrowserIdentity(key: string, identity?: BrowserIdData): Promise<void> {
  const chosen = identity ?? (await ensureBrowserIdentity());
  setActiveIdentity(chosen.did);
  const vaultysId = VaultysId.fromSecret(chosen.secret, "base64").toVersion(1);
  const channel = new BrowserChannel(`${SERVER_URL}/api/public/user/request`, key);
  await srp(channel, vaultysId);
}

/**
 * The second SRP of the bootstrap's double-SRP flow
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b): after the login round completes
 * and `/api/public/user/listen/[token]` reports a `certRound`, the browser
 * runs this — same identity `connectWithBrowserIdentity` just used (tracked as
 * "active" above, not just "whatever's stored"), same transport,
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
