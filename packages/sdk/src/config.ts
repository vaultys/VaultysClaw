import type { AgentCapability } from "@vaultysclaw/shared";

export interface AgentRuntimeConfig {
  name: string;
  controlPlaneUrl: string;
  controlPlaneWsUrl?: string;
  peerjsControlPlaneId?: string;
  peerjsServerUrl?: string;
  peerjsServer?: string;
  vaultysIdPath: string;
  requestedCapabilities: AgentCapability[];
  workspaceRoot?: string;
  /** What kind of registrant this is. Defaults to "agent" — set to "proxy"
   * for a Proxy runtime so the control plane routes registration through the
   * Proxy tables instead of the Agent tables. */
  kind?: "agent" | "proxy";
}
