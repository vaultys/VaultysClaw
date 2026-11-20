"use client";

import { X } from "lucide-react";
import { MarkerIcon } from "./MarkerIcon";
import { MARKER_TYPES, typeColor, type MapCluster, type MapMarker } from "./types";

export function ClusterSidebar({
  cluster,
  onClose,
  onMarkerClick,
}: {
  cluster: MapCluster;
  onClose: () => void;
  onMarkerClick?: (marker: MapMarker) => void;
}) {
  const types = Array.from(new Set([...MARKER_TYPES, ...Object.keys(cluster.byType)]));

  return (
    <div className="w-80 border-l border-neutral-200/60 bg-background flex flex-col overflow-hidden rounded-r-lg">
      <div className="px-4 py-3 border-b border-neutral-200/60 flex items-center justify-between bg-background-100">
        <h3 className="font-medium text-foreground text-sm">Cluster details</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-foreground-500 hover:text-foreground transition-colors"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="flex h-6 min-w-6 items-center justify-center rounded-md px-1 font-mono text-xs font-medium tabular-nums text-white"
              style={{ background: typeColor(cluster.dominantType) }}
            >
              {cluster.count}
            </span>
            <span className="text-sm font-medium tabular-nums text-foreground">{cluster.count} markers</span>
          </div>
          <div className="text-xs text-foreground-500 space-y-1 ml-8">
            <div className="tabular-nums">{cluster.onlineCount} online</div>
            <div className="font-mono tabular-nums text-foreground-500">
              {cluster.lat.toFixed(4)}, {cluster.lon.toFixed(4)}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-200/60">
          <h4 className="text-xs font-medium mb-2 text-foreground-600">By type</h4>
          <div className="space-y-1 text-xs text-foreground-500">
            {types
              .filter((t) => (cluster.byType[t] ?? 0) > 0)
              .map((type) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="flex items-center gap-1 capitalize">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: typeColor(type) }} />
                    {type}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">{cluster.byType[type]}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-200/60">
          <h4 className="text-xs font-medium mb-2 text-foreground-600">Markers</h4>
          <div className="space-y-2">
            {cluster.markers.map((marker) => (
              <button
                type="button"
                key={marker.id}
                className="block w-full text-left text-xs border border-neutral-200/60 bg-background-100 rounded-lg p-2 hover:bg-background-200 transition-colors"
                onClick={() => onMarkerClick?.(marker)}
              >
                <div className="flex items-start gap-2">
                  <span className="flex shrink-0 mt-0.5" style={{ color: typeColor(marker.type) }}>
                    <MarkerIcon type={marker.type} size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{marker.label}</div>
                    <div className="text-foreground-500 capitalize text-xs mt-0.5">
                      {marker.type}
                      {marker.online !== undefined && (
                        <span
                          role="img"
                          aria-label={marker.online ? "Online" : "Offline"}
                          title={marker.online ? "Online" : "Offline"}
                          className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                            marker.online ? "bg-success-600" : "bg-neutral-400"
                          }`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
