/**
 * Mint an admin identity for a disposable control plane, and hand it back as a restorable
 * browser-identity backup.
 *
 * The demo stack has no wallet and no admin: `simulator:up` brings up an empty database, so there
 * is nobody who can open the console to look at the fleet the simulator just created. The
 * "connect without the app" bootstrap covers the very first human, but only once, and only from a
 * browser — it cannot help you get back in after `simulator:nuke`, and it cannot give you the
 * *same* identity twice.
 *
 * So this generates the identity server-side, writes the Actor and the `admin_console_access`
 * grant straight into the ledger, and exports the private key in exactly the encrypted format
 * `lib/identity-backup.ts` restores — the same file the console's own "Back up identities" produces.
 * Nothing here is a special login path: the result is an ordinary human Actor holding an ordinary
 * certificate, and the browser signs in with the same Challenger exchange it always uses.
 *
 * **Only ever point this at a disposable database.** It is a deliberate back door around admin
 * approval — appropriate for a stack whose whole purpose is being reset, and for nothing else.
 */

import { randomUUID } from "node:crypto";
import { VaultysId } from "@vaultys/id";
import {
  signCapabilityGrantCert,
  signCapabilityRequestCert,
  type AgentCapability,
} from "@vaultysclaw/policy";
import { createBackup, backupFilename } from "@vaultysclaw/controlplane/identity-backup";
import type { BrowserIdData } from "@vaultysclaw/controlplane/browser-identity";
import { prisma } from "./db.js";

/** What an admin needs to actually use the console. `portal_access` rides along so the same
 *  identity also works if you land on `/portal` rather than `/admin`. */
const ADMIN_CAPABILITIES: AgentCapability[] = ["admin_console_access", "portal_access"];

export interface MintedAdmin {
  did: string;
  name: string;
  certId: string;
  /** The encrypted backup, ready to write to disk. */
  backup: unknown;
  suggestedFilename: string;
  /**
   * A one-liner to paste into the browser console, which loads this identity directly into
   * `localStorage` in the shape `lib/browser-connect.ts` reads.
   *
   * Needed because the *proper* restore path cannot be reached from the browser this is for: the
   * backup UI lives behind the "advanced identity management" opt-in, whose toggle is on
   * `/identity` — a page you have to already be signed in to open. From a fresh browser with no
   * key, that is a closed loop. The snippet also sets the opt-in, so the picker and the backup
   * panel are there afterwards.
   *
   * It carries the raw private key, unlike the backup file. That is the deliberate trade: it goes
   * to a terminal you are already looking at, for a database built to be thrown away.
   */
  browserSnippet: string;
}

/**
 * Create (or re-grant) an admin human and return an encrypted backup of its key.
 *
 * Re-running with the same `--name` does **not** mint a second identity: it reuses the existing
 * Actor if one is already there under that name, so a repeated run tops up the grant rather than
 * littering the ledger with half-configured admins. A fresh key is only generated when there is no
 * such Actor — which is also the only case where a backup file is worth anything, since the key
 * for an existing Actor was already handed out and is not recoverable from the database.
 */
export async function mintAdmin(input: {
  databaseUrl: string | undefined;
  name: string;
  email: string | null;
  passphrase: string;
}): Promise<MintedAdmin> {
  const db = prisma(input.databaseUrl);

  const serverSecret = await db.setting.findUnique({ where: { key: "serverSecret" } });
  if (!serverSecret?.value) {
    throw new Error(
      "This control plane has no server identity yet — start it once (`pnpm simulator:up`) so it " +
        "can generate one, then run this again."
    );
  }
  const serverVid = VaultysId.fromSecret(serverSecret.value, "base64").toVersion(1);

  // `User.email` is unique, and this command mints a *fresh* identity every run — so re-running it
  // with the same `--email` collides on a row this command itself created a moment ago. Caught here
  // rather than surfacing as a raw Prisma P2002 from inside a nested create, which says nothing
  // about which address is at fault or what to do next.
  if (input.email) {
    const holder = await db.user.findUnique({ where: { email: input.email } });
    if (holder) {
      throw new Error(
        `"${input.email}" is already registered to ${holder.did}. Every run of this command mints a ` +
          `new identity, so pass a different --email (or omit it — the profile does not need one).`
      );
    }
  }

  const identity = (await VaultysId.generateMachine()).toVersion(1);
  const browserIdentity: BrowserIdData = {
    did: identity.did,
    // Base64 of the raw id bytes, matching `generateBrowserIdentity` exactly — the picker reads
    // this back to display the identity, and a different encoding here would restore an entry the
    // browser cannot use.
    vid: Buffer.from(identity.id).toString("base64"),
    secret: identity.getSecret("base64"),
    type: "software",
  };

  await db.actor.upsert({
    where: { did: identity.did },
    create: {
      did: identity.did,
      name: input.name,
      kind: "human",
      // The public key the control plane needs to re-verify anything this identity signs later —
      // normally captured from the handshake, so it has to be recorded here too or the certificate
      // detail page cannot verify this Actor's own certificates.
      publicKey: Buffer.from(identity.id).toString("base64"),
      kindConfig: {},
      humanProfile: {
        create: {
          email: input.email,
          // Already named here, so the first-login prompt at /welcome has nothing to ask.
          profileCompletedAt: new Date(),
        },
      },
    },
    update: { name: input.name, lastSeen: new Date() },
  });

  // The co-signed request/grant pair, exactly as `lib/certificates.ts`'s `issueAdminGrant` builds
  // it: the control plane signs both halves, which is the ledger's own signal that nobody actually
  // asked for this grant — a system-issued one (trust doc §3.2).
  const certId = randomUUID();
  const requestCert = await signCapabilityRequestCert(serverVid, {
    agentDid: identity.did,
    requestedCapabilities: ADMIN_CAPABILITIES,
    nonce: `simulator-admin-${Date.now()}`,
  });
  const certificate = await signCapabilityGrantCert(serverVid, {
    certId,
    agentDid: identity.did,
    workspaceId: null,
    grantedCapabilities: ADMIN_CAPABILITIES,
    resourceLimits: null,
    scope: null,
    requestCert,
    // Standing, like the bootstrap grant. A demo admin whose access silently expires mid-demo is
    // a worse failure than one that outlives the database it is for — and the database is
    // disposable anyway.
    expiresAt: null,
  });

  await db.capabilityCertificate.create({
    data: {
      id: certId,
      agentDid: identity.did,
      workspaceId: null,
      capabilities: ADMIN_CAPABILITIES as never,
      resourceLimits: undefined,
      scope: undefined,
      certFormat: "packcert",
      certificate,
      requestCertificate: requestCert,
      expiresAt: null,
      issuedBy: "simulator:admin",
    },
  });

  const backup = await createBackup([browserIdentity], input.passphrase);

  // Merges rather than replaces, matching `mergeBrowserIdentities` — pasting this must not silently
  // destroy whatever keys the browser already holds.
  const browserSnippet =
    `(()=>{const K='vaultysclaw:devIdentities',A='vaultysclaw:activeDevIdentityDid',` +
    `d=${JSON.stringify(browserIdentity)};` +
    `const l=JSON.parse(localStorage.getItem(K)||'[]').filter(i=>i.did!==d.did);` +
    `l.push(d);localStorage.setItem(K,JSON.stringify(l));localStorage.setItem(A,d.did);` +
    `localStorage.setItem('vaultysclaw:advancedIdentity','1');` +
    `return 'loaded '+d.did})()`;

  return {
    did: identity.did,
    name: input.name,
    certId,
    backup,
    suggestedFilename: backupFilename(),
    browserSnippet,
  };
}
