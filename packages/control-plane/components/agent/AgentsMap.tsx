"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Globe } from "lucide-react";
import type { MapMarker } from "@/components/map/WorldMap";
import { mapClient, unwrap } from "@/lib/api/ts-rest/client";

const WorldMap = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);

/**
 * Map view of the agents page. Self-contained: fetches its own location
 * markers from `/api/map` (independent of the list filters) and navigates to
 * an agent's detail page on marker click.
 */
export function AgentsMap() {
  const router = useRouter();
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMarkers = useCallback(async () => {
    setLoading(true);
    try {
      const { markers } = unwrap(await mapClient.get({ query: {} }));
      setMarkers(markers.filter((m) => m.type === "agent"));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkers();
  }, [fetchMarkers]);

  return (
    <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary-600" />
          <span className="text-sm font-semibold text-foreground">
            Agent Locations
          </span>
          <span className="text-xs text-foreground-500 bg-background-200 rounded-full px-2 py-0.5">
            {markers.length} located
          </span>
        </div>
        <button
          onClick={fetchMarkers}
          className="text-xs text-foreground-500 hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : markers.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <Globe className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-foreground-500 text-sm">
            No agents have a location set yet.
          </p>
          <p className="text-foreground-400 text-xs mt-1">
            Agents are auto-located when they connect, or you can set a location
            manually in each agent&apos;s settings.
          </p>
        </div>
      ) : (
        <WorldMap
          markers={markers}
          height={480}
          onMarkerClick={(m) =>
            router.push(`/agents/${encodeURIComponent(m.id)}`)
          }
        />
      )}
    </div>
  );
}
