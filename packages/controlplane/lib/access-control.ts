/**
 * Whether a given DID can do something is decided entirely by the
 * certificate ledger — never by a role stored on a session or a User row
 * (docs/REBUILD_ARCHITECTURE.md §4.5). This is the one helper every gated
 * page/route goes through.
 */
import { resolvePermission } from "@vaultysclaw/trust";
import type { AgentCapability } from "@vaultysclaw/policy";
import { CapabilityCertificateDAO } from "@/db";

export async function hasCapability(
  did: string,
  capability: AgentCapability,
  resource?: string
): Promise<boolean> {
  const certs = await CapabilityCertificateDAO.findAllForPrincipal(did);
  return resolvePermission({ capability, resource }, certs, Date.now()).allowed;
}
