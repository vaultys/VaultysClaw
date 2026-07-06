"use client";

import { useCallback } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { ClusterSidebar } from "./ClusterSidebar";
import { LocationEditor } from "./LocationEditor";
import { MapTooltip } from "./MapTooltip";
import { useOlMap } from "./useOlMap";
import type { MapLocation, MapMarker, WorldMapProps } from "./types";

export function MapInner({
  markers,
  height = 400,
  className,
  onMarkerClick,
  onSaveLocation,
  canEditLocation = false,
}: WorldMapProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const {
    mapDivRef,
    tooltip,
    setTooltip,
    selectedCluster,
    setSelectedCluster,
    editingMarker,
    setEditingMarker,
    zoomIn,
    zoomOut,
    resetView,
  } = useOlMap({ markers, isDark, onMarkerClick });

  const isEditable = useCallback(
    (marker: MapMarker) => {
      if (!onSaveLocation) return false;
      return typeof canEditLocation === "function"
        ? canEditLocation(marker)
        : canEditLocation;
    },
    [canEditLocation, onSaveLocation]
  );

  const handleSaveLocation = useCallback(
    async (loc: MapLocation | null) => {
      if (!editingMarker || !onSaveLocation) return;
      await onSaveLocation(editingMarker, loc);
      setEditingMarker(null);
      setTooltip(null);
    },
    [editingMarker, onSaveLocation, setEditingMarker, setTooltip]
  );

  const ZOOM_BTN =
    "p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors";

  return (
    <div
      className={`relative flex select-none ${className ?? ""}`}
      style={{ height }}
    >
      <div className="flex-1 relative">
        <div
          ref={mapDivRef}
          style={{ width: "100%", height: "100%" }}
          className="rounded-l-lg"
        />

        <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1">
          <button onClick={zoomOut} className={ZOOM_BTN} title="Zoom out">
            <Minus size={14} />
          </button>
          <button onClick={zoomIn} className={ZOOM_BTN} title="Zoom in">
            <Plus size={14} />
          </button>
          <button onClick={resetView} className={ZOOM_BTN} title="Reset view">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {selectedCluster && (
        <ClusterSidebar
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
          onMarkerClick={onMarkerClick}
        />
      )}

      {tooltip && (
        <MapTooltip
          tooltip={tooltip}
          onClose={() => {
            setTooltip(null);
            setEditingMarker(null);
          }}
          isEditable={isEditable}
          onEdit={setEditingMarker}
        />
      )}

      {editingMarker && onSaveLocation && (
        <LocationEditor
          current={{
            lat: editingMarker.lat,
            lon: editingMarker.lon,
            label: editingMarker.label,
          }}
          onSave={handleSaveLocation}
          onClose={() => setEditingMarker(null)}
        />
      )}
    </div>
  );
}
