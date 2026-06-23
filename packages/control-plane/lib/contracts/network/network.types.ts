import { z } from "zod";
import {
  NetworkControlBodySchema,
  NetworkLogQuerySchema,
} from "./network.schemas";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
//
// Network state is runtime-only (live WebSocket / PeerJS server stats and log
// buffers) and has no Prisma backing model, so these are hand-written shapes
// mirroring `AgentWSServer.getNetworkStats()` / `getLogs()` in lib/ws-server.ts.

export type NetworkTransport = "ws" | "peerjs";

export interface TransportStats {
  messagesIn: number;
  messagesOut: number;
  bytesIn: number;
  bytesOut: number;
  connectionsTotal: number;
  activeAgents: number;
  pendingConnections: number;
}

export interface ConnectedAgentRow {
  id: string;
  name: string;
  transport: NetworkTransport;
  connectedAt: string;
  lastHeartbeat: string;
}

export interface NetworkLogEntry {
  id: string;
  timestamp: string;
  transport: NetworkTransport;
  level: "info" | "warn" | "error";
  event: string;
  detail?: string;
}

export interface NetworkStats {
  startedAt: string;
  ws: TransportStats;
  peerjs: TransportStats;
  agents: ConnectedAgentRow[];
}

export interface PeerjsState {
  peerId: string | null;
  running: boolean;
  startedAt: string | null;
  serverUrl: string | null;
}

export interface NetworkResponse {
  stats: NetworkStats | null;
  logs: { ws: NetworkLogEntry[]; peerjs: NetworkLogEntry[] };
  peerjs: PeerjsState;
}

export interface NetworkControlResponse {
  ok: boolean;
  running?: boolean;
  restarted?: boolean;
  port?: number;
  peerId?: string | null;
}

export type NetworkControlBody = z.infer<typeof NetworkControlBodySchema>;
export type NetworkControlAction = NetworkControlBody["action"];
export type NetworkLogQuery = z.infer<typeof NetworkLogQuerySchema>;
