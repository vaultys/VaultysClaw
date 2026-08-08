/**
 * The shape of a dev-mode VaultysID as this browser stores it, and the one
 * function that repairs an old one.
 *
 * Split out of `lib/browser-connect.ts` deliberately: that module imports
 * `@vaultys/channel-browser`, which is browser-only and does not resolve under
 * Node, so anything importing a *value* from it drags a browser dependency into
 * every consumer — including `lib/identity-backup.ts`, whose whole job is pure
 * data handling and whose tests run in Node. A type-only import was erased at
 * compile time and hid the problem until the first value import needed here.
 *
 * Nothing in this file touches `localStorage`, WebAuthn, or the network.
 */

export type DevIdentityType = "software" | "software-pqc" | "passkey" | "hardware";

export interface BrowserIdData {
  did: string;
  vid: string; // base64 public key
  secret: string; // base64 secret
  type: DevIdentityType;
}

/**
 * Fills in `type` for an identity stored before that field existed.
 *
 * Only the legacy *single-identity* storage key ever got this treatment;
 * entries already in the multi-identity list were cast straight to
 * `BrowserIdData[]` and kept whatever shape they were written with, so an
 * identity created before the multi-type work has no `type` and nothing ever
 * fixed it. That went unnoticed because `type` is purely descriptive — the
 * connect path never reads it, and `DevIdentityPicker` already falls back with
 * `TYPE_META[t] ?? TYPE_META.software`.
 *
 * `lib/identity-backup.ts` was the first code to actually *validate* the shape,
 * which is how it surfaced: restoring a real four-identity backup failed on
 * "Identity 1 in this backup is missing required fields."
 */
export function normaliseIdentity(entry: Partial<BrowserIdData>): BrowserIdData {
  return { ...(entry as BrowserIdData), type: entry.type ?? "software" };
}
