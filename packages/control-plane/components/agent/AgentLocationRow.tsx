"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";

const LocationEditor = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.LocationEditor),
  { ssr: false }
);

export function AgentLocationRow({
  did,
  lat,
  lon,
  label,
}: {
  did: string;
  lat: number | null;
  lon: number | null;
  label: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState<{
    lat: number;
    lon: number;
    label: string;
  } | null>(
    lat != null && lon != null ? { lat, lon, label: label ?? "" } : null
  );

  const handleSave = useCallback(
    async (loc: { lat: number; lon: number; label: string } | null) => {
      const body =
        loc === null
          ? { lat: null }
          : { lat: loc.lat, lon: loc.lon, label: loc.label };
      const res = await fetch(
        `/api/agents/${encodeURIComponent(did)}/location`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(d?.error ?? "Failed to save location");
      }
      setCurrent(loc);
    },
    [did]
  );

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <MapPin size={14} className="text-foreground-500" /> Location
        </h2>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-0.5 transition-colors"
        >
          {current ? "Edit" : "Set location"}
        </button>
      </div>
      {current ? (
        <div className="text-sm text-foreground">
          <span className="font-medium">
            {current.label || "Custom location"}
          </span>
          <span className="text-foreground-400 font-mono text-xs ml-2">
            {current.lat.toFixed(4)}, {current.lon.toFixed(4)}
          </span>
        </div>
      ) : (
        <p className="text-xs text-foreground-400">
          No location set. Agents are auto-located on connect, or you can set
          one manually.
        </p>
      )}
      {editing && (
        <LocationEditor
          current={current}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
