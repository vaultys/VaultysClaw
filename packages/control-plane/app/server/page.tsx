"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ActivityLogEntry {
  id: number;
  event: string;
  agent_did: string | null;
  agent_name: string | null;
  details: string | null;
  created_at: string;
}

interface ServerData {
  identity: Record<string, unknown> | null;
  stats: {
    totalAgents: number;
    onlineAgents: number;
    offlineAgents: number;
  };
  activityLog: ActivityLogEntry[];
}

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return parseUTC(iso).toLocaleString();
}

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `did:…${did.slice(-8)}`;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  agent_authenticated: { label: "Authenticated", color: "text-green-400" },
  agent_connected: { label: "Connected", color: "text-blue-400" },
  agent_disconnected: { label: "Disconnected", color: "text-gray-400" },
  auth_failed: { label: "Auth Failed", color: "text-red-400" },
};

export default function ServerPage() {
  const router = useRouter();
  const [data, setData] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/server");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ServerData = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-vc-muted text-sm">Loading server info…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-xl px-4 py-3 text-red-600 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-vc-surface p-5 rounded-xl border border-vc-border">
            <div className="text-vc-muted text-xs uppercase tracking-wider mb-1">Registered Agents</div>
            <div className="text-3xl font-bold text-vc-text">{data.stats.totalAgents}</div>
          </div>
          <div className="bg-vc-surface p-5 rounded-xl border border-vc-border">
            <div className="text-vc-muted text-xs uppercase tracking-wider mb-1">Online Now</div>
            <div className="text-3xl font-bold text-green-400">{data.stats.onlineAgents}</div>
          </div>
          <div className="bg-vc-surface p-5 rounded-xl border border-vc-border">
            <div className="text-vc-muted text-xs uppercase tracking-wider mb-1">Offline</div>
            <div className="text-3xl font-bold text-gray-500">{data.stats.offlineAgents}</div>
          </div>
        </div>
      )}

      {/* Server Identity */}
      <section className="bg-vc-surface rounded-xl border border-vc-border p-5">
        <h2 className="text-sm font-semibold text-vc-text mb-4">Server VaultysID</h2>
        {data?.identity ? (
          <pre className="bg-vc-raised rounded p-4 text-sm font-mono text-vc-text-2 overflow-x-auto">
            {JSON.stringify(data.identity, null, 2)}
          </pre>
        ) : (
          <p className="text-vc-muted text-sm">Server identity not configured.</p>
        )}
      </section>

      {/* Activity Log */}
      <section className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
        <div className="px-5 py-4 border-b border-vc-border flex justify-between items-center">
          <h2 className="text-sm font-semibold text-vc-text">Activity History</h2>
          <button
            onClick={fetchData}
            className="bg-vc-raised hover:bg-vc-ring px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-vc-text"
          >
            ↻ Refresh
          </button>
        </div>

        {data && data.activityLog.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-vc-ring text-left text-xs font-medium text-vc-muted uppercase">
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Event</th>
                  <th className="px-6 py-3">Agent</th>
                  <th className="px-6 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.activityLog.map((entry) => {
                  const evt = EVENT_LABELS[entry.event] ?? {
                    label: entry.event,
                    color: "text-gray-300",
                  };
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-vc-ring hover:bg-vc-raised/50 transition"
                    >
                      <td className="px-6 py-3 text-sm text-vc-muted whitespace-nowrap">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className={`px-6 py-3 text-sm font-medium ${evt.color}`}>
                        {evt.label}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        {entry.agent_did ? (
                          <span
                            className="text-blue-400 hover:text-blue-300 cursor-pointer font-mono"
                            title={entry.agent_did}
                            onClick={() =>
                              router.push(
                                `/agents/${encodeURIComponent(entry.agent_did!)}`
                              )
                            }
                          >
                            {entry.agent_name ?? shortDid(entry.agent_did)}
                          </span>
                        ) : (
                          <span className="text-vc-subtle">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-vc-muted font-mono max-w-xs truncate">
                        {entry.details ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-vc-muted">
            <p>No activity recorded yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
