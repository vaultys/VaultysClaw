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
}
