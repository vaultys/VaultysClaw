"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Wifi, Radio, Map, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { timeAgo } from "@vaultysclaw/shared";
import {
  adminApi,
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { NetworkControlAction, NetworkResponse } from "@/lib/contracts";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { WsTab } from "@/components/network/WsTab";
import { PeerjsTab } from "@/components/network/PeerjsTab";
import { MapTab } from "@/components/network/MapTab";

type NetworkTab = "ws" | "peerjs" | "map";

export default function NetworkPage() {
  const [data, setData] = useState<NetworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<NetworkTab>("ws");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      setData(unwrap(await userApi.network.get({ query: {} })));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch network data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
    intervalRef.current = setInterval(() => fetchData(true), 5_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  async function handleControl(
    action: NetworkControlAction,
    serverUrl?: string | null
  ) {
    unwrap(await adminApi.network.control({ body: { action, serverUrl } }));
    await fetchData(false);
  }

  const stats = data?.stats;
  const agents = stats?.agents ?? [];
  const logs = data?.logs ?? { ws: [], peerjs: [] };

  useBreadcrumbs([{ label: "Network" }], []);

  useToolbar(
    {
      title: "Network",
      description: stats?.startedAt
        ? `Monitor and control transport connections · server up since ${timeAgo(stats.startedAt)}`
        : "Monitor and control transport connections",
      actions: [
        {
          kind: "tabs",
          id: "tab",
          value: tab,
          onChange: (v) => setTab(v as NetworkTab),
          options: [
            { value: "ws", label: "WebSocket", icon: <Wifi className="w-3.5 h-3.5" /> },
            { value: "peerjs", label: "WebRTC / PeerJS", icon: <Radio className="w-3.5 h-3.5" /> },
            { value: "map", label: "Map", icon: <Map className="w-3.5 h-3.5" /> },
          ],
        },
        {
          kind: "button",
          id: "refresh",
          label: "Refresh",
          icon: (
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          ),
          onClick: () => fetchData(false),
          disabled: refreshing,
        },
      ],
    },
    [tab, refreshing, stats?.startedAt, fetchData]
  );

  return (
    <div className="p-6 w-full max-w-6xl mx-auto space-y-6">
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-primary-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 bg-danger-50 border border-danger-300 rounded-xl px-4 py-3 text-sm text-danger-600">
          <AlertTriangle size={14} />
          {error}
        </div>
      ) : (
        <>
          {tab === "ws" && (
            <WsTab
              stats={stats?.ws}
              agents={agents}
              logs={logs.ws}
              onRestartWs={() => handleControl("restart-ws")}
            />
          )}
          {tab === "peerjs" && data && (
            <PeerjsTab
              data={data.peerjs}
              stats={stats?.peerjs}
              agents={agents}
              logs={logs.peerjs}
              onAction={handleControl}
            />
          )}
          {tab === "map" && data && (
            <MapTab stats={stats} peerjs={data.peerjs} agents={agents} />
          )}
        </>
      )}
    </div>
  );
}
