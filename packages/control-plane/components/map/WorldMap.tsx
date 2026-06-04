"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon } from "leaflet";
import type { DivIcon, LeafletEvent, LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { Bot, User, Database, Server, MapPin, X, RotateCcw, Plus, Minus } from "lucide-react";

export interface MapMarker {
  id: string;
  type: "agent" | "user" | "docling" | "s3";
  label: string;
  lat: number;
  lon: number;
  online?: boolean;
  meta?: Record<string, unknown>;
}

const TYPE_COLOR: Record<MapMarker["type"], string> = {
  agent: "#6366f1",
  user: "#10b981",
  docling: "#f59e0b",
  s3: "#3b82f6",
};

const TYPE_ONLINE_COLOR: Record<MapMarker["type"], string> = {
  agent: "#818cf8",
  user: "#34d399",
  docling: "#fbbf24",
  s3: "#60a5fa",
};

function MarkerIcon({ type, size = 14 }: { type: MapMarker["type"]; size?: number }) {
  const props = { size, strokeWidth: 2 };
  if (type === "agent") return <Bot {...props} />;
  if (type === "user") return <User {...props} />;
  if (type === "docling") return <Server {...props} />;
  return <Database {...props} />;
}

interface TooltipState {
  kind: "marker" | "cluster";
  marker?: MapMarker;
  cluster?: MapCluster;
  x: number;
  y: number;
}

interface MapCluster {
  id: string;
  lat: number;
  lon: number;
  count: number;
  markers: MapMarker[];
  byType: Record<MapMarker["type"], number>;
  dominantType: MapMarker["type"];
  onlineCount: number;
}

type RenderPoint =
  | { kind: "marker"; marker: MapMarker }
  | { kind: "cluster"; cluster: MapCluster };

const CLUSTER_ZOOM_THRESHOLD = 10;
const DETAIL_ZOOM_LEVEL = 10;
const MAX_MAP_ZOOM = 20;

function buildPinIcon({
  color,
  size,
  text,
}: {
  color: string;
  size: number;
  text?: string;
}): DivIcon {
  const txt = text ?? "";
  const txtSize = Math.max(9, Math.round(size * 0.36));

  return divIcon({
    className: "",
    iconSize: [size, size + 12],
    iconAnchor: [size / 2, size + 12],
    tooltipAnchor: [0, -size],
    html: `<div style="position:relative;width:${size}px;height:${size + 12}px;display:flex;align-items:flex-start;justify-content:center;">
      <div style="position:relative;width:${size}px;height:${size}px;background:${color};border:2px solid #ffffff;border-radius:${size}px ${size}px ${size}px 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(15,23,42,0.35);">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(45deg);color:#ffffff;font-weight:700;font-size:${txtSize}px;line-height:1;">${txt}</div>
      </div>
    </div>`,
  });
}

function MapEvents({
  onChange,
  onBackgroundClick,
}: {
  onChange: (next: { center: [number, number]; zoom: number }) => void;
  onBackgroundClick: () => void;
}) {
  useMapEvents({
    zoomend: (e: LeafletEvent) => {
      const map = e.target;
      const c = map.getCenter();
      onChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
    moveend: (e: LeafletEvent) => {
      const map = e.target;
      const c = map.getCenter();
      onChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
    click: () => onBackgroundClick(),
  });
  return null;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    const current = map.getCenter();
    const sameCenter =
      Math.abs(current.lat - center[0]) < 0.000001 &&
      Math.abs(current.lng - center[1]) < 0.000001;
    const sameZoom = Math.abs(map.getZoom() - zoom) < 0.001;

    if (!sameCenter || !sameZoom) {
      map.setView(center, zoom, { animate: true });
    }
  }, [center, zoom, map]);

  return null;
}

function MapLegendControl({ markers, renderPoints }: { markers: MapMarker[]; renderPoints: RenderPoint[] }) {
  const mapInstance = useMap();

  useEffect(() => {
    const container = L.DomUtil.create("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "8px";
    container.style.padding = "8px";
    container.style.background = "rgba(255, 255, 255, 0.85)";
    container.style.backdropFilter = "blur(4px)";
    container.style.borderRadius = "8px";
    container.style.border = "1px solid #e5e7eb";
    container.style.fontSize = "12px";
    container.style.fontFamily = "system-ui, -apple-system, sans-serif";

    if (markers.length !== renderPoints.length) {
      const clusterEl = L.DomUtil.create("div");
      clusterEl.style.display = "flex";
      clusterEl.style.alignItems = "center";
      clusterEl.style.gap = "8px";
      const dot = L.DomUtil.create("span");
      dot.style.width = "8px";
      dot.style.height = "8px";
      dot.style.borderRadius = "50%";
      dot.style.background = "#6b7280";
      const text = L.DomUtil.create("span");
      text.style.color = "#374151";
      text.textContent = `Clusters: ${markers.length - renderPoints.length}`;
      clusterEl.appendChild(dot);
      clusterEl.appendChild(text);
      container.appendChild(clusterEl);
    }

    for (const type of ["agent", "user", "docling", "s3"] as const) {
      if (!markers.some((m) => m.type === type)) continue;

      const itemEl = L.DomUtil.create("div");
      itemEl.style.display = "flex";
      itemEl.style.alignItems = "center";
      itemEl.style.gap = "8px";

      const dot = L.DomUtil.create("span");
      dot.style.width = "8px";
      dot.style.height = "8px";
      dot.style.borderRadius = "50%";
      dot.style.background = TYPE_COLOR[type];

      const label = L.DomUtil.create("span");
      label.style.color = "#374151";
      label.textContent =
        type === "s3" ? "Storage" : type === "docling" ? "Docling" : type + "s";

      itemEl.appendChild(dot);
      itemEl.appendChild(label);
      container.appendChild(itemEl);
    }

    const control = L.Control.extend({
      onAdd: () => container,
    });

    new control({ position: "bottomleft" }).addTo(mapInstance);

    return () => {
      // Clean up
    };
  }, [mapInstance, markers, renderPoints]);

  return null;
}

function emptyTypeCounts(): Record<MapMarker["type"], number> {
  return { agent: 0, user: 0, docling: 0, s3: 0 };
}

function dominantTypeFromCounts(
  byType: Record<MapMarker["type"], number>
): MapMarker["type"] {
  const ordered: MapMarker["type"][] = ["agent", "user", "docling", "s3"];
  let winner: MapMarker["type"] = "agent";
  for (const type of ordered) {
    if (byType[type] > byType[winner]) winner = type;
  }
  return winner;
}

function clusterCellSizeForZoom(zoom: number): number {
  return Math.max(0.8, 14 / Math.max(1, zoom));
}

function buildRenderPoints(markers: MapMarker[], zoom: number): RenderPoint[] {
  if (zoom >= CLUSTER_ZOOM_THRESHOLD) {
    return markers.map((marker) => ({ kind: "marker", marker }));
  }

  const cellSize = clusterCellSizeForZoom(zoom);
  const buckets = new Map<string, MapMarker[]>();

  for (const marker of markers) {
    const latCell = Math.floor((marker.lat + 90) / cellSize);
    const lonCell = Math.floor((marker.lon + 180) / cellSize);
    const key = `${latCell}:${lonCell}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(marker);
    } else {
      buckets.set(key, [marker]);
    }
  }

  const points: RenderPoint[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length === 1) {
      points.push({ kind: "marker", marker: bucket[0] });
      continue;
    }

    let lat = 0;
    let lon = 0;
    let onlineCount = 0;
    const byType = emptyTypeCounts();

    for (const marker of bucket) {
      lat += marker.lat;
      lon += marker.lon;
      byType[marker.type] += 1;
      if (marker.online !== false) onlineCount += 1;
    }

    const cluster: MapCluster = {
      id: `cluster:${key}`,
      lat: lat / bucket.length,
      lon: lon / bucket.length,
      count: bucket.length,
      markers: bucket,
      byType,
      dominantType: dominantTypeFromCounts(byType),
      onlineCount,
    };

    points.push({ kind: "cluster", cluster });
  }

  return points;
}

interface Props {
  markers: MapMarker[];
  height?: number;
  className?: string;
  onMarkerClick?: (marker: MapMarker) => void;
  onSaveLocation?: (
    marker: MapMarker,
    loc: { lat: number; lon: number; label: string } | null
  ) => Promise<void>;
  canEditLocation?: boolean | ((marker: MapMarker) => boolean);
}

function MapInner({
  markers,
  height = 400,
  className,
  onMarkerClick,
  onSaveLocation,
  canEditLocation = false,
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<MapCluster | null>(null);
  const [editingMarker, setEditingMarker] = useState<MapMarker | null>(null);
  const [position, setPosition] = useState<{ center: [number, number]; zoom: number }>({
    center: [20, 0],
    zoom: 1,
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const renderPoints = useMemo(
    () => buildRenderPoints(markers, position.zoom),
    [markers, position.zoom]
  );

  const resetView = useCallback(() => {
    setPosition({ center: [20, 0], zoom: 1 });
  }, []);

  const zoomIn = useCallback(() => {
    setPosition((prev) => ({
      ...prev,
      zoom: Math.min(MAX_MAP_ZOOM, prev.zoom * 1.25),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setPosition((prev) => ({
      ...prev,
      zoom: Math.max(1, prev.zoom / 1.25),
    }));
  }, []);

  // Close tooltip on outside click
  useEffect(() => {
    const handler = () => {
      setTooltip(null);
      setEditingMarker(null);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

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
    async (loc: { lat: number; lon: number; label: string } | null) => {
      if (!editingMarker || !onSaveLocation) return;
      await onSaveLocation(editingMarker, loc);
      setEditingMarker(null);
      setTooltip(null);
    },
    [editingMarker, onSaveLocation]
  );

  if (!isMounted) {
    return (
      <div className={`relative select-none ${className ?? ""}`} style={{ height }} />
    );
  }

  return (
    <div className={`relative flex select-none ${className ?? ""}`} style={{ height }}>
      {/* Map container */}
      <div className="flex-1 relative">
        <MapContainer
          center={position.center}
          zoom={position.zoom}
          minZoom={1}
          maxZoom={MAX_MAP_ZOOM}
          zoomControl={false}
          style={{ width: "100%", height: "100%" }}
          className="rounded-l-lg"
        >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains={["a", "b", "c", "d"]}
          maxZoom={MAX_MAP_ZOOM}
        />

        <MapController center={position.center} zoom={position.zoom} />
        <MapEvents
          onChange={setPosition}
          onBackgroundClick={() => {
            setTooltip(null);
            setEditingMarker(null);
          }}
        />
        <MapLegendControl markers={markers} renderPoints={renderPoints} />

        {renderPoints.map((point) => {
          const marker = point.kind === "marker" ? point.marker : null;
          const cluster = point.kind === "cluster" ? point.cluster : null;
          const color = marker
            ? marker.online !== false
              ? TYPE_ONLINE_COLOR[marker.type]
              : TYPE_COLOR[marker.type]
            : TYPE_COLOR[cluster!.dominantType];

          const pinSize = marker
            ? Math.max(20, Math.min(34, 30 / Math.sqrt(Math.max(1, position.zoom / 2))))
            : Math.max(24, Math.min(42, 36 / Math.sqrt(Math.max(1, position.zoom / 2))));
          const pinText = cluster
            ? cluster.count > 99
              ? "99+"
              : String(cluster.count)
            : "";
          const icon = buildPinIcon({ color, size: pinSize, text: pinText });

          return (
            <Marker
              key={marker ? marker.id : cluster!.id}
              position={marker ? [marker.lat, marker.lon] : [cluster!.lat, cluster!.lon]}
              icon={icon}
              eventHandlers={{
                click: (e: LeafletMouseEvent) => {
                  const nativeEvent = e.originalEvent as MouseEvent;
                  if (marker) {
                    setTooltip({
                      kind: "marker",
                      marker,
                      x: nativeEvent.clientX,
                      y: nativeEvent.clientY,
                    });
                    onMarkerClick?.(marker);
                    return;
                  }

                  if (!cluster) return;
                  setSelectedCluster(cluster);
                  setPosition((prev) => ({
                    center: [cluster.lat, cluster.lon],
                    zoom: Math.min(MAX_MAP_ZOOM, prev.zoom + 2),
                  }));
                },
              }}
            >
              {marker && position.zoom >= 3 && (
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -8]}
                  className="!bg-transparent !border-0 !shadow-none !text-[11px] !text-slate-700 !font-medium !p-0"
                  opacity={1}
                >
                  {marker.label.length > 20 ? marker.label.slice(0, 18) + "…" : marker.label}
                </Tooltip>
              )}

              {marker && position.zoom >= DETAIL_ZOOM_LEVEL && (
                <Tooltip
                  permanent
                  direction="bottom"
                  offset={[0, 8]}
                  className="!bg-transparent !border-0 !shadow-none !text-[10px] !text-slate-500 !font-normal !p-0"
                  opacity={1}
                >
                  {marker.type === "s3" ? "storage" : marker.type}
                  {marker.online !== undefined ? (marker.online ? " · online" : " · offline") : ""}
                </Tooltip>
              )}
            </Marker>
          );
        })}
        </MapContainer>

        {/* Zoom controls */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
            title="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={zoomIn}
            className="p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
            title="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={resetView}
            className="p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
            title="Reset view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Right sidebar - Cluster details */}
      {selectedCluster && (
        <div className="w-80 border-l border-neutral-200 bg-background flex flex-col overflow-hidden rounded-r-lg shadow-md">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-background-50">
            <h3 className="font-semibold text-foreground text-sm">Cluster Details</h3>
            <button
              onClick={() => setSelectedCluster(null)}
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
                  style={{ background: TYPE_COLOR[selectedCluster.dominantType] }}
                >
                  {selectedCluster.count}
                </span>
                <span className="text-sm font-medium text-foreground">{selectedCluster.count} markers</span>
              </div>
              <div className="text-xs text-foreground-500 space-y-1 ml-8">
                <div>{selectedCluster.onlineCount} online</div>
                <div className="text-foreground-400">
                  {selectedCluster.lat.toFixed(4)}, {selectedCluster.lon.toFixed(4)}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-200">
              <h4 className="text-xs font-medium text-foreground mb-2 uppercase tracking-wide text-foreground-600">
                By Type
              </h4>
              <div className="space-y-1 text-xs text-foreground-500">
                {(["agent", "user", "docling", "s3"] as const)
                  .filter((type) => selectedCluster.byType[type] > 0)
                  .map((type) => {
                    const label =
                      type === "s3" ? "Storage" : type === "docling" ? "Docling" : `${type}s`;
                    return (
                      <div key={type} className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: TYPE_COLOR[type] }}
                          />
                          {label}
                        </span>
                        <span className="text-foreground font-medium">{selectedCluster.byType[type]}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-200">
              <h4 className="text-xs font-medium text-foreground mb-2 uppercase tracking-wide text-foreground-600">
                Markers
              </h4>
              <div className="space-y-2">
                {selectedCluster.markers.map((marker) => (
                  <div
                    key={marker.id}
                    className="text-xs bg-background-100 rounded-lg p-2 cursor-pointer hover:bg-background-200 transition-colors"
                    onClick={() => {
                      onMarkerClick?.(marker);
                    }}
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
                        <div className="font-medium text-foreground truncate">{marker.label}</div>
                        <div className="text-foreground-400 capitalize text-[10px] mt-0.5">
                          {marker.type === "s3" ? "Storage" : marker.type}
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
      )}

      {tooltip && (
        <div
          className="fixed z-50 bg-background border border-neutral-200 rounded-xl shadow-lg p-3 min-w-[180px] max-w-[260px]"
          style={{ top: tooltip.y + 8, left: tooltip.x + 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="absolute top-2 right-2 text-foreground-400 hover:text-foreground"
            onClick={() => {
              setTooltip(null);
              setEditingMarker(null);
            }}
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
                {isEditable(tooltip.marker) && (
                  <button
                    onClick={() => setEditingMarker(tooltip.marker!)}
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
                <div className="pt-1 text-foreground-500">
                  {(["agent", "user", "docling", "s3"] as const)
                    .filter((type) => tooltip.cluster!.byType[type] > 0)
                    .map((type) => {
                      const label =
                        type === "s3"
                          ? "Storage"
                          : type === "docling"
                            ? "Docling"
                            : `${type}s`;
                      return `${label}: ${tooltip.cluster!.byType[type]}`;
                    })
                    .join(" · ")}
                </div>
                <div className="pt-1 text-primary-600">Click to view details</div>
              </div>
            </>
          )}
        </div>
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

// Dynamically load the map only on the client to prevent double-initialization in React Strict Mode
const DynamicMapInner = dynamic(() => Promise.resolve(MapInner), {
  ssr: false,
  loading: () => (
    <div
      style={{ width: "100%", height: "400px" }}
      className="bg-background-100 rounded-lg animate-pulse"
    />
  ),
});

export function WorldMap(props: Props) {
  return <DynamicMapInner {...props} />;
}

/* ─── Geocode input helper ──────────────────────────────────────────────────── */

interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

export async function geocodeCity(query: string): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "en", "User-Agent": "VaultysClaw/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      label: data[0].display_name?.split(",").slice(0, 3).join(", ") ?? query,
    };
  } catch {
    return null;
  }
}

/* ─── Location editor modal ─────────────────────────────────────────────────── */

interface LocationEditorProps {
  current?: { lat: number; lon: number; label: string } | null;
  onSave: (loc: { lat: number; lon: number; label: string } | null) => Promise<void>;
  onClose: () => void;
}

export function LocationEditor({ current, onSave, onClose }: LocationEditorProps) {
  const [mode, setMode] = useState<"city" | "coords">("city");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState(current?.lat?.toString() ?? "");
  const [lon, setLon] = useState(current?.lon?.toString() ?? "");
  const [label, setLabel] = useState(current?.label ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "city") {
        const result = await geocodeCity(city);
        if (!result) {
          setError("City not found. Try a more specific name or use coordinates.");
          setLoading(false);
          return;
        }
        await onSave(result);
      } else {
        const latN = parseFloat(lat);
        const lonN = parseFloat(lon);
        if (isNaN(latN) || isNaN(lonN)) {
          setError("Invalid coordinates.");
          setLoading(false);
          return;
        }
        await onSave({ lat: latN, lon: lonN, label: label || `${latN.toFixed(4)}, ${lonN.toFixed(4)}` });
      }
      onClose();
    } catch {
      setError("Failed to save location.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      await onSave(null);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-background border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary-600" />
            <h3 className="font-semibold text-foreground">Set Location</h3>
          </div>
          <button onClick={onClose} className="text-foreground-400 hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 bg-background-100 rounded-lg p-1">
          {(["city", "coords"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-500 hover:text-foreground"
                }`}
            >
              {m === "city" ? "City name" : "Coordinates"}
            </button>
          ))}
        </div>

        {mode === "city" ? (
          <input
            type="text"
            placeholder="e.g. Paris, France"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
            autoFocus
          />
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
              />
              <input
                type="number"
                placeholder="Longitude"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
              />
            </div>
            <input
              type="text"
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
            />
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}

        {current && (
          <p className="mt-2 text-xs text-foreground-500">
            Current: {current.label} ({current.lat.toFixed(4)}, {current.lon.toFixed(4)})
          </p>
        )}

        <div className="flex gap-2 mt-4">
          {current && (
            <button
              onClick={handleClear}
              disabled={loading}
              className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg border border-red-200 transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs text-foreground-500 hover:text-foreground rounded-lg border border-neutral-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || (mode === "city" ? !city.trim() : !lat || !lon)}
            className="px-4 py-2 text-xs bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
