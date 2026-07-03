"use client";

import { useState, useEffect } from "react";
import { Server, Loader2 } from "lucide-react";
import { IntegrationPanel, IntegrationHeader } from "./shared";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";

interface ServerInfo {
  stats: {
    totalAgents: number;
    onlineAgents: number;
    offlineAgents: number;
  };
  sysInfo: {
    hostname: string;
    platform: string;
    osType: string;
    osRelease: string;
    uptime: number;
    cpuCount: number;
    cpuModel: string;
    totalMem: number;
    freeMem: number;
    loadAvg: number[];
  };
  identity: Record<string, unknown> | null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ServerInfoPanel() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.server
      .get()
      .then((res) => setInfo(unwrap(res) as unknown as ServerInfo))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <IntegrationPanel>
      <IntegrationHeader
        icon={Server}
        title="Server Information"
        description="VaultysClaw control plane status"
      />
      <div className="p-5 space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Agent Stats */}
            {info?.stats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-background-200 rounded-lg p-4">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">Total Agents</p>
                  <p className="text-2xl font-bold text-foreground">{info.stats.totalAgents}</p>
                </div>
                <div className="bg-background-200 rounded-lg p-4">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">Online</p>
                  <p className="text-2xl font-bold text-success-700">{info.stats.onlineAgents}</p>
                </div>
                <div className="bg-background-200 rounded-lg p-4">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">Offline</p>
                  <p className="text-2xl font-bold text-neutral-500">{info.stats.offlineAgents}</p>
                </div>
              </div>
            )}

            {/* System Info */}
            {info?.sysInfo && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background-200 rounded-lg p-3">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">Hostname</p>
                  <p className="text-sm font-medium text-foreground truncate">{info.sysInfo.hostname}</p>
                </div>
                <div className="bg-background-200 rounded-lg p-3">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">Platform</p>
                  <p className="text-sm font-medium text-foreground truncate">
                    {info.sysInfo.osType} {info.sysInfo.osRelease}
                  </p>
                </div>
                <div className="bg-background-200 rounded-lg p-3">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">Uptime</p>
                  <p className="text-sm font-medium text-foreground">{formatUptime(info.sysInfo.uptime)}</p>
                </div>
                <div className="bg-background-200 rounded-lg p-3">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">CPU</p>
                  <p className="text-sm font-medium text-foreground">{info.sysInfo.cpuCount} cores</p>
                </div>
                <div className="bg-background-200 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">Memory</p>
                  <p className="text-sm font-medium text-foreground">
                    {formatBytes(info.sysInfo.totalMem - info.sysInfo.freeMem)} / {formatBytes(info.sysInfo.totalMem)}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </IntegrationPanel>
  );
}
