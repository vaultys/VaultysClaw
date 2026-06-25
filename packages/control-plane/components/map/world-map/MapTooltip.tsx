"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { MarkerIcon } from "./MarkerIcon";
import { TYPE_COLOR, type MapMarker, type TooltipState } from "./types";

export function MapTooltip({
  tooltip,
  onClose,
  isEditable,
  onEdit,
}: {
  tooltip: TooltipState;
  onClose: () => void;
  isEditable: (marker: MapMarker) => boolean;
  onEdit: (marker: MapMarker) => void;
}) {
  return (
    <div
      className="fixed z-50 bg-background border border-neutral-200 rounded-xl shadow-lg p-3 min-w-[180px] max-w-[260px]"
      style={{ top: tooltip.y + 8, left: tooltip.x + 8 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="absolute top-2 right-2 text-foreground-400 hover:text-foreground"
        onClick={onClose}
      >
        <X size={12} />
      </button>

      {tooltip.kind === "marker" && tooltip.marker && (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="flex items-center justify-center w-6 h-6 rounded-md"
              style={{
                background: TYPE_COLOR[tooltip.marker.type] + "20",
                color: TYPE_COLOR[tooltip.marker.type],
              }}
            >
              <MarkerIcon type={tooltip.marker.type} size={13} />
            </span>
            <span className="text-xs font-semibold text-foreground truncate pr-4">
              {tooltip.marker.label}
            </span>
          </div>
          <div className="text-xs text-foreground-500 space-y-0.5">
            <div className="capitalize">{tooltip.marker.type}</div>
            {tooltip.marker.online !== undefined && (
              <div className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${tooltip.marker.online ? "bg-green-500" : "bg-neutral-400"}`}
                />
                {tooltip.marker.online ? "Online" : "Offline"}
              </div>
            )}
            <div className="text-foreground-400">
              {tooltip.marker.lat.toFixed(4)}, {tooltip.marker.lon.toFixed(4)}
            </div>
            {tooltip.marker.type === "agent" &&
              typeof tooltip.marker.meta?.did === "string" && (
                <Link
                  href={`/agents/${tooltip.marker.meta.did}`}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500"
                >
                  View agent page →
                </Link>
              )}
            {isEditable(tooltip.marker) && (
              <button
                onClick={() => onEdit(tooltip.marker!)}
                className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-500"
              >
                Edit location
              </button>
            )}
          </div>
        </>
      )}

      {tooltip.kind === "cluster" && tooltip.cluster && (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="flex items-center justify-center w-6 h-6 rounded-md text-white text-[10px] font-bold"
              style={{ background: TYPE_COLOR[tooltip.cluster.dominantType] }}
            >
              {tooltip.cluster.count}
            </span>
            <span className="text-xs font-semibold text-foreground truncate pr-4">
              {tooltip.cluster.count} clustered markers
            </span>
          </div>
          <div className="text-xs text-foreground-500 space-y-0.5">
            <div>{tooltip.cluster.onlineCount} online</div>
            <div className="text-foreground-400">
              {tooltip.cluster.lat.toFixed(4)}, {tooltip.cluster.lon.toFixed(4)}
            </div>
            <div className="pt-1 text-primary-600">Click to view details</div>
          </div>
        </>
      )}
    </div>
  );
}
