/**
 * What happens at the moment an SSO login succeeds.
 *
 * The problem this solves: an IdP can tell us *who* someone is before that
 * person holds a VaultysId, and this schema has nowhere to put such a human —
 * `Actor.did`/`User.did` are primary keys, and `Session.user.did` is
 * non-nullable because every authorization decision in this package is a ledger
 * lookup keyed by DID. packages/control-plane sidestepped that with a nullable
 * `User.did` and a "claim your account later" state, which means a signed-in
 * user who is not yet anybody in the trust model — precisely the parallel trust
 * tier docs/CERTIFICATE_WEB_OF_TRUST.md §6.3 rules out.
 *
 * So an unbound SSO login never produces a session. It produces a **binding
 * link**: a system-issued, short-lived `Invitation` carrying the IdP's own
 * name/email, redeemed through the existing invite flow (wallet QR, or a dev
 * identity in development). That handshake is what mints the Actor and the DID;
 * redemption then binds the external identity to it, and every later login is an
 * ordinary DID session with no SSO-specific path at all.
 *
 * Consequences worth being explicit about:
 *  - SSO establishes identity, never authorization. A freshly bound human holds
 *    only `portal_access` (BINDING_CAPABILITIES) and sees the Access Portal;
 *    admin rights are a separate, deliberate certificate an admin issues.
 *  - Anyone your IdP will authenticate can therefore obtain an Actor. That is
 *    the same trust boundary as the IdP itself, which is the point of federating
 *    to it — but it means the connection should point at a directory whose
 *    membership you actually control, not a public multi-tenant issuer.
 */
import type { AgentCapability } from "@vaultysclaw/policy";
import { InvitationDAO, SsoIdentityDAO } from "@/db";

/**
 * What a newly bound SSO human gets. Portal access only — enough to sign in and
 * see what they hold, nothing more. Deliberately not configurable per connection
 * yet: "which IdP you came from" is not a good reason to hold more capability,
 * and making it a knob would quietly turn SSO config into permission config.
 */
export const BINDING_CAPABILITIES: AgentCapability[] = ["portal_access"];

/** Binding links are for finishing a flow already in progress, so they expire in
 *  an hour rather than an admin invite's days. */
const BINDING_TTL_MS = 60 * 60 * 1000;

export interface SsoLoginClaims {
  subject: string;
  issuer: string;
  email?: string | null;
  name?: string | null;
}

export type SsoLoginOutcome =
  /** Already bound — sign this DID in normally. */
  | { kind: "signin"; did: string }
  /** Not bound yet — send the browser here to bind a VaultysId. */
  | { kind: "bind"; url: string };

/**
 * Resolve an SSO login to either a DID to sign in, or a binding URL.
 *
 * Records the login either way: an unbound identity is still a real,
 * auditable fact about who tried to get in.
 */
export async function resolveSsoLogin(
  connectionId: string,
  claims: SsoLoginClaims
): Promise<SsoLoginOutcome> {
  const identity = await SsoIdentityDAO.upsertFromClaims({
    connectionId,
    subject: claims.subject,
    issuer: claims.issuer,
    email: claims.email,
    name: claims.name,
  });

  if (identity.did) return { kind: "signin", did: identity.did };

  // Exactly one live binding link per identity — see the DAO method's comment.
  await InvitationDAO.deletePendingForSsoIdentity(identity.id);

  const { rawToken } = await InvitationDAO.create({
    // The IdP's claims are the best name/email available, and they're also what
    // makes the redeemed account skip the first-login profile prompt.
    name: claims.name?.trim() || claims.email?.trim() || "Unnamed",
    email: claims.email ?? null,
    capabilities: BINDING_CAPABILITIES,
    createdBy: `system:sso:${connectionId}`,
    expiresAt: new Date(Date.now() + BINDING_TTL_MS),
    ssoIdentityId: identity.id,
  });

  return { kind: "bind", url: `/invite/${rawToken}?sso=1` };
}

/**
 * Called from the invite redemption path once a DID actually exists. Returns
 * false if the identity was bound in the meantime — `bindDid` only ever moves a
 * row from unbound to bound, never repoints an existing binding.
 */
export async function bindSsoIdentity(ssoIdentityId: string, did: string): Promise<boolean> {
  return SsoIdentityDAO.bindDid(ssoIdentityId, did);
}
