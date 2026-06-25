"use client";

import { X } from "lucide-react";
import { MarkerIcon } from "./MarkerIcon";
import {
  MARKER_TYPES,
  TYPE_COLOR,
  markerTypeLabel,
  type MapCluster,
  type MapMarker,
} from "./types";

export function ClusterSidebar({
  cluster,
  onClose,
  onMarkerClick,
}: {
  cluster: MapCluster;
  onClose: () => void;
  onMarkerClick?: (marker: MapMarker) => void;
}) {
  return (
    <div className="w-80 border-l border-neutral-200 bg-background flex flex-col overflow-hidden rounded-r-lg shadow-md">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-background-50">
        <h3 className="font-semibold text-foreground text-sm">Cluster Details</h3>
        <button
          onClick={onClose}
          className="text-foreground-400 hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="flex items-center justify-center w-6 h-6 rounded-md text-white text-xs font-bold"
              style={{ background: TYPE_COLOR[cluster.dominantType] }}
            >
              {cluster.count}
            </span>
            <span className="text-sm font-medium text-foreground">
              {cluster.count} markers
            </span>
          </div>
          <div className="text-xs text-foreground-500 space-y-1 ml-8">
            <div>{cluster.onlineCount} online</div>
            <div className="text-foreground-400">
              {cluster.lat.toFixed(4)}, {cluster.lon.toFixed(4)}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-200">
          <h4 className="text-xs font-medium mb-2 uppercase tracking-wide text-foreground-600">
            By Type
          </h4>
          <div className="space-y-1 text-xs text-foreground-500">
            {MARKER_TYPES.filter((t) => cluster.byType[t] > 0).map((type) => (
              <div key={type} className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: TYPE_COLOR[type] }}
                  />
                  {type === "agent" || type === "user"
                    ? `${type}s`
                    : markerTypeLabel(type)}
                </span>
                <span className="text-foreground font-medium">
                  {cluster.byType[type]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-200">
          <h4 className="text-xs font-medium mb-2 uppercase tracking-wide text-foreground-600">
            Markers
          </h4>
          <div className="space-y-2">
            {cluster.markers.map((marker) => (
              <div
                key={marker.id}
                className="text-xs bg-background-100 rounded-lg p-2 cursor-pointer hover:bg-background-200 transition-colors"
                onClick={() => onMarkerClick?.(marker)}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 mt-0.5"
                    style={{
                      background: TYPE_COLOR[marker.type] + "20",
                      color: TYPE_COLOR[marker.type],
                    }}
                  >
                    <MarkerIcon type={marker.type} size={11} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {marker.label}
                    </div>
                    <div className="text-foreground-400 capitalize text-[10px] mt-0.5">
                      {markerTypeLabel(marker.type)}
                      {marker.online !== undefined && (
                        <span className="ml-1">
                          {marker.online ? "🟢" : "⚪"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
