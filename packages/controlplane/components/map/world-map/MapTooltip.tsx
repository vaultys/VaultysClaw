"use client";

import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { MarkerIcon } from "./MarkerIcon";
import { typeColor, type MapMarker, type TooltipState } from "./types";
import { encodeDidParam } from "@/lib/actor-route";

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
        className="absolute top-2 right-2 text-foreground-500 transition-colors hover:text-foreground"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={12} strokeWidth={1.5} />
      </button>

      {tooltip.kind === "marker" && tooltip.marker && (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            {/* The kind colour is the map's own legend, so the icon keeps it. */}
            <span className="flex shrink-0" style={{ color: typeColor(tooltip.marker.type) }}>
              <MarkerIcon type={tooltip.marker.type} size={14} />
            </span>
            <span className="text-xs font-medium text-foreground truncate pr-4">
              {tooltip.marker.label}
            </span>
          </div>
          <div className="text-xs text-foreground-500 space-y-0.5">
            <div className="capitalize">{tooltip.marker.type}</div>
            {tooltip.marker.online !== undefined && (
              <div className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${tooltip.marker.online ? "bg-success-600" : "bg-neutral-400"}`}
                />
                {tooltip.marker.online ? "Online" : "Offline"}
              </div>
            )}
            <div className="font-mono tabular-nums text-foreground-500">
              {tooltip.marker.lat.toFixed(4)}, {tooltip.marker.lon.toFixed(4)}
            </div>
            {typeof tooltip.marker.meta?.did === "string" && (
              <Link
                href={`/admin/actors/${encodeDidParam(tooltip.marker.meta.did)}`}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
              >
                View actor page
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Link>
            )}
            {isEditable(tooltip.marker) && (
              <button
                onClick={() => onEdit(tooltip.marker!)}
                className="mt-2 text-xs font-medium text-primary-700 hover:underline"
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
              className="flex h-6 min-w-6 items-center justify-center rounded-md px-1 font-mono text-xs font-medium tabular-nums text-white"
              style={{ background: typeColor(tooltip.cluster.dominantType) }}
            >
              {tooltip.cluster.count}
            </span>
            <span className="text-xs font-medium text-foreground truncate pr-4">
              {tooltip.cluster.count} clustered markers
            </span>
          </div>
          <div className="text-xs text-foreground-500 space-y-0.5">
            <div className="tabular-nums">{tooltip.cluster.onlineCount} online</div>
            <div className="font-mono tabular-nums text-foreground-500">
              {tooltip.cluster.lat.toFixed(4)}, {tooltip.cluster.lon.toFixed(4)}
            </div>
            <div className="pt-1 text-foreground-600">Click to view details</div>
          </div>
        </>
      )}
    </div>
  );
}
