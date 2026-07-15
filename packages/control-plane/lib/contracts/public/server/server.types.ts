export interface ServerInfoResponse {
  identity: Record<string, unknown> | null;
  stats: { totalAgents: number; onlineAgents: number; offlineAgents: number };
  sysInfo: Record<string, unknown>;
  walletUrl: string;
}
