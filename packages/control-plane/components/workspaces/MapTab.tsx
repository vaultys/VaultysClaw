"use client";

import dynamic from "next/dynamic";
import { Globe2 } from "lucide-react";
import type { MapMarker } from "@/lib/contracts";

const WorldMap = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);

export function MapTab({
  markers,
  loading,
  canEdit,
  onSaveLocation,
}: {
  markers: MapMarker[];
  loading: boolean;
  canEdit: boolean;
  onSaveLocation: (
    marker: MapMarker,
    loc: { lat: number; lon: number; label: string } | null
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-primary-600" />
          <span className="text-sm font-semibold text-foreground">
            Workspace Locations
          </span>
          <span className="text-xs text-foreground-500 bg-background-200 rounded-full px-2 py-0.5">
            {markers.length} located
          </span>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : markers.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Globe2 className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-foreground-500 text-sm">
              No members of this workspace have a location set.
            </p>
            <p className="text-foreground-400 text-xs mt-1">
              Agents are auto-located on connect. Users can set their location
              in their profile.
            </p>
          </div>
        ) : (
          <WorldMap
            markers={markers}
            height={480}
            onSaveLocation={onSaveLocation}
            canEditLocation={canEdit}
          />
        )}
      </div>
    </div>
  );
}
