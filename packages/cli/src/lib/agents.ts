/**
 * Resolve an agent reference (name or DID) to its DID + capabilities by
 * querying the control plane.
 */

import { api } from "./http.js";

export interface ResolvedAgent {
  did: string;
  name: string;
  capabilities: string[];
}

interface AgentItem {
  did: string;
  name: string;
  capabilities?: string[];
}

interface SearchResponse {
  items: AgentItem[];
}

export async function resolveAgent(
  baseUrl: string,
  cookie: string,
  ref: string
): Promise<ResolvedAgent> {
  // A DID is passed straight through (still fetched to confirm it exists).
  const looksLikeDid = ref.includes(":");
  const res = await api<SearchResponse>(baseUrl, "/api/agents", {
    cookie,
    query: { search: looksLikeDid ? undefined : ref, pageSize: 100 },
  });

  const matches = looksLikeDid
    ? res.items.filter((a) => a.did === ref)
    : res.items.filter((a) => a.name === ref);

  if (matches.length === 0) {
    throw new Error(`No agent found matching "${ref}"`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple agents named "${ref}" — pass the DID instead (${matches
        .map((m) => m.did)
        .join(", ")})`
    );
  }
  const a = matches[0];
  return { did: a.did, name: a.name, capabilities: a.capabilities ?? [] };
}
