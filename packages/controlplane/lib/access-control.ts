/**
 * Whether a given DID can do something is decided entirely by the
 * certificate ledger — never by a role stored on a session or a User row
 * (docs/REBUILD_ARCHITECTURE.md §4.5). This is the one helper every gated
 * page/route goes through.
 */
import { resolvePermission } from "@vaultysclaw/trust";
import type { AgentCapability, CertScope } from "@vaultysclaw/policy";
import { ActorDAO, CapabilityCertificateDAO } from "@/db";
import { getKillSwitchState, suppressionFor } from "./kill-switch";

export async function hasCapability(
  did: string,
  capability: AgentCapability,
  resource?: string
): Promise<boolean> {
  const certs = await CapabilityCertificateDAO.findAllForActor(did);
  const decision = resolvePermission({ capability, resource }, certs, Date.now());
  if (!decision.allowed) return false;

  // An armed kill switch (`lib/kill-switch.ts`) suspends the certificate that
  // just authorized this. Humans are exempt, so this never affects the admin
  // console — but `hasCapability` is the server-side decision point for
  // non-human DIDs too, and it must not authorize what the signed status
  // protocol would refuse.
  //
  // Checked after `resolvePermission`, and only against the one certificate
  // that granted the permission: a denial needs no kill-switch state at all, and
  // an allow only has to ask about the grant it actually rests on.
  const state = await getKillSwitchState();
  if (!state.global && state.byWorkspace.size === 0) return true;

  const actor = await ActorDAO.findByDid(did);
  if (!actor) return false;
  if (actor.kind === "human") return true;

  const granting = decision.grantingCertId
    ? await CapabilityCertificateDAO.findById(decision.grantingCertId)
    : null;
  if (!granting) return false;
  return !suppressionFor(
    { workspaceId: granting.workspaceId, scope: granting.scope as CertScope | null },
    actor,
    state
  );
}
