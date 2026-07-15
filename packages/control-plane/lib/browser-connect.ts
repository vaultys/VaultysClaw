"use client";

/**
 * browser-connect — shared client helpers for VaultysID browser-side identities.
 *
 * Two distinct browser-stored identities are used:
 *   - vaultysclaw:browserVid     → the bastion *device* identity (first factor)
 *   - vaultysclaw:browserUserVid → the *user* identity used by the "dev login"
 *                                  option, which performs the SRP itself instead
 *                                  of delegating to the mobile VaultysID app.
 *
 * The "dev login" mode reuses exactly the same SRP primitive as the bastion flow
 * (a BrowserChannel against /api/public/user/request driven by the cert `key`), just
 * with a user identity and a configurable service ("auth" for login, "register"
 * for claim/invite).
 */

import { BrowserChannel } from "@vaultys/channel-browser";
import { Challenger, VaultysId, crypto } from "@vaultys/id";

const Buffer = crypto.Buffer;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WalletSecurityType = "SOFTWARE" | "PASSKEY" | "HARDWARE";
export type SrpService = "auth" | "register";

export interface BrowserIdData {
  did: string;
  vid: string; // base64 public key
  secret: string; // base64 secret
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

export const BASTION_ID_KEY = "vaultysclaw:browserVid";
export const USER_ID_KEY = "vaultysclaw:browserUserVid";

export const SERVER_URL =
  typeof window !== "undefined" ? window.location.origin : "";

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export function getStoredBrowserId(
  storageKey: string = BASTION_ID_KEY
): BrowserIdData | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(storageKey);
  return raw ? (JSON.parse(raw) as BrowserIdData) : null;
}

export function storeBrowserId(
  data: BrowserIdData,
  storageKey: string = BASTION_ID_KEY
) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Identity generation
// ---------------------------------------------------------------------------

function getPkCred(
  requireResidentKey: boolean
): PublicKeyCredentialCreationOptions {
  const safari = /^((?!chrome|android).)*applewebkit/i.test(
    navigator.userAgent
  );
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
      authenticatorAttachment: requireResidentKey
        ? "platform"
        : "cross-platform",
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

export async function generateBrowserId(
  securityType: WalletSecurityType,
  storageKey: string = BASTION_ID_KEY
): Promise<BrowserIdData> {
  let vaultysId: VaultysId;
  switch (securityType) {
    case "PASSKEY": {
      const attestation = (await navigator.credentials.create({
        publicKey: getPkCred(true),
      })) as PublicKeyCredential;
      vaultysId = (await VaultysId.fido2FromAttestation(attestation)).toVersion(
        1
      );
      break;
    }
    case "HARDWARE": {
      const attestation = (await navigator.credentials.create({
        publicKey: getPkCred(false),
      })) as PublicKeyCredential;
      vaultysId = (await VaultysId.fido2FromAttestation(attestation)).toVersion(
        1
      );
      break;
    }
    default:
      vaultysId = (await VaultysId.generateMachine()).toVersion(1);
  }
  const did = vaultysId.did;
  const vid = Buffer.from(vaultysId.id).toString("base64");
  const secret = vaultysId.getSecret("base64");
  const data = { did, vid, secret };
  storeBrowserId(data, storageKey);
  return data;
}

// ---------------------------------------------------------------------------
// SRP
// ---------------------------------------------------------------------------

/**
 * Runs the two-round VaultysID Challenger SRP exchange over `channel`, acting as
 * the wallet/initiator. `service` is "auth" for login or "register" for
 * registration/claim flows.
 */
export async function srp(
  channel: BrowserChannel,
  vaultysId: VaultysId,
  service: SrpService = "auth"
): Promise<void> {
  const challenger = new Challenger(vaultysId);
  challenger.createChallenge("p2p", service, 0);
  const cert = challenger.getCertificate();
  if (!cert) {
    channel.close();
    throw new Error("Failed to create challenge");
  }
  channel.send(cert);
  const serverCert = await channel.receive();
  const contact = Challenger.deserializeCertificate(serverCert).pk2;
  if (!contact) throw new Error("Server did not send pk2");
  await challenger.update(serverCert);
  if (challenger.isComplete()) {
    const finalCert = challenger.getCertificate();
    if (!finalCert) throw new Error("No final certificate");
    channel.send(finalCert);
  } else {
    throw new Error("Challenge not complete after two rounds");
  }
}

// ---------------------------------------------------------------------------
// Dev login — browser performs the SRP itself
// ---------------------------------------------------------------------------

export interface BrowserDirectConnectArgs {
  /** Raw certificate key (hex), as returned by /api/public/user/connect, claim, or invite. */
  key: string;
  /** "auth" for login, "register" for claim/invite. */
  service: SrpService;
  /** Security type used when the user identity must be generated. */
  securityType: WalletSecurityType;
}

/**
 * Authenticates the browser directly against the control plane, without the
 * mobile VaultysID app. Reuses (or generates) the persisted user identity, then
 * drives the SRP exchange against /api/public/user/request using `key`.
 *
 * The caller is expected to be polling /api/public/user/listen/[token] already — this
 * function only completes the server-side certificate; it does not poll.
 */
export async function runBrowserDirectConnect({
  key,
  service,
  securityType,
}: BrowserDirectConnectArgs): Promise<void> {
  let userVid = getStoredBrowserId(USER_ID_KEY);
  if (!userVid) {
    userVid = await generateBrowserId(securityType, USER_ID_KEY);
  }

  const vaultysId = VaultysId.fromSecret(userVid.secret, "base64").toVersion(1);
  const channel = new BrowserChannel(`${SERVER_URL}/api/public/user/request`, key);
  await srp(channel, vaultysId, service);
}
