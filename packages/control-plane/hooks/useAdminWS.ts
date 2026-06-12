"use client";

import { AgentInfo } from "@/lib/contracts";
import { useState, useEffect, useRef, useCallback } from "react";

interface AgentsState {
  agents: AgentInfo[];
  total: number;
  online: number;
}

interface PendingRegistration {
  id: string;
  sessionId: string;
  agentName: string;
  status: string;
  requestedCapabilities: unknown; // already-parsed array from Prisma JSONB
  assignedCapabilities: unknown;
  createdAt: string;
  connected: boolean;
  agentDid: string | null;
}

interface AdminWSState {
  agents: AgentsState;
  registrations: PendingRegistration[];
  connected: boolean;
  lastEvent: string | null;
}

interface AdminWSMessage {
  type: "state_update";
  event?: string;
  agents: AgentsState;
  registrations: PendingRegistration[];
  timestamp: string;
}

export type { PendingRegistration };

const RECONNECT_DELAY_MS = 2000;

/**
 * React hook for live admin WebSocket updates.
 * Connects to ws://host/ws/admin and receives state snapshots
 * whenever agents connect/disconnect or registrations change.
 *
 * Falls back to REST polling if the WebSocket is not available.
 */
export function useAdminWS(): AdminWSState {
  const [state, setState] = useState<AdminWSState>({
    agents: { agents: [], total: 0, online: 0 },
    registrations: [],
    connected: false,
    lastEvent: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/admin`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: AdminWSMessage = JSON.parse(event.data);
        if (msg.type === "state_update") {
          setState({
            agents: msg.agents,
            registrations: msg.registrations,
            connected: true,
            lastEvent: msg.event ?? null,
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, connected: false }));
      wsRef.current = null;
      // Reconnect after delay
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return state;
}
