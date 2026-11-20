"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { encodeDidParam } from "@/lib/actor-route";
import { Badge } from "@/components/ui/Badge";

export interface SensorDirectoryRow {
  did: string;
  name: string;
  os?: string | null;
  linkedTo: string;
  workspaceName: string;
  workloadCount: number;
  online: boolean;
  lastSeen: string;
}

const MAX_VISIBLE_ROWS = 160;

function searchableText(sensor: SensorDirectoryRow): string {
  return [
    sensor.did,
    sensor.name,
    sensor.os ?? "",
    sensor.linkedTo,
    sensor.workspaceName,
    sensor.online ? "online" : "offline",
  ].join(" ").toLowerCase();
}

export default function SensorDirectoryPanel({ sensors }: { sensors: SensorDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sensors.filter((sensor) => {
      if (status === "online" && !sensor.online) return false;
      if (status === "offline" && sensor.online) return false;
      return needle ? searchableText(sensor).includes(needle) : true;
    });
  }, [query, sensors, status]);

  const visible = filtered.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = filtered.length - visible.length;

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-neutral-200/60 bg-background-100 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Search sensors
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary-500/30 focus-within:border-primary-400">
              <Search className="h-4 w-4 shrink-0 text-foreground-500" strokeWidth={1.5} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by device, DID, OS, workspace, link, or status"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear sensor search"
                  className="rounded p-0.5 text-foreground-500 transition-colors hover:bg-background-200 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
          <div className="md:w-48">
            <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            >
              <option value="all">All statuses</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground-500">
          <span className="tabular-nums">
            Showing {filtered.length} of {sensors.length} sensors
          </span>
          {(query || status !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
              className="font-medium text-primary-700 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="border-b border-neutral-200/60 bg-background-200/40 text-left text-xs text-foreground-500">
            <tr>
              <th className="px-4 py-2 font-normal">Device</th>
              <th className="px-4 py-2 font-normal">Linked to</th>
              <th className="px-4 py-2 font-normal">Workspace</th>
              <th className="px-4 py-2 font-normal text-right">Workloads</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((sensor) => (
              <tr key={sensor.did} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/sensors/${encodeDidParam(sensor.did)}`}
                    className="text-foreground font-medium hover:text-primary-700 hover:underline"
                  >
                    {sensor.name || <span className="text-foreground-500">Unnamed device</span>}
                  </Link>
                  <div className="text-xs text-foreground-500 font-mono">{sensor.did}</div>
                  {sensor.os && <div className="text-xs text-foreground-500">{sensor.os}</div>}
                </td>
                <td className="px-4 py-2.5 text-foreground-500">{sensor.linkedTo}</td>
                <td className="px-4 py-2.5 text-foreground-500">{sensor.workspaceName}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-foreground-700">
                  {sensor.workloadCount}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={sensor.online ? "positive" : "muted"}>
                    {sensor.online ? "Online" : "Offline"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-foreground-500">{sensor.lastSeen}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-foreground-500">
                  No sensors match these filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-foreground-500">
          {hiddenCount} more sensors hidden. Refine the search to narrow the list.
        </p>
      )}
    </section>
  );
}
