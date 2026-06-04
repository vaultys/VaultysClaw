"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { Bot, User, Database, Server, MapPin, X, RotateCcw } from "lucide-react";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
  marker: MapMarker;
  x: number;
  y: number;
}

interface Props {
  markers: MapMarker[];
  height?: number;
  className?: string;
  onMarkerClick?: (marker: MapMarker) => void;
}

export function WorldMap({ markers, height = 400, className, onMarkerClick }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [position, setPosition] = useState<{ center: [number, number]; zoom: number }>({
    center: [0, 20],
    zoom: 1,
  });

  const resetView = useCallback(() => {
    setPosition({ center: [0, 20], zoom: 1 });
  }, []);

  // Close tooltip on outside click
  useEffect(() => {
    const handler = () => setTooltip(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  return (
    <div className={`relative select-none ${className ?? ""}`} style={{ height }}>
      {/* Reset zoom button */}
      <button
        onClick={resetView}
        className="absolute top-2 right-2 z-10 p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
        title="Reset view"
      >
        <RotateCcw size={14} />
      </button>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          center={position.center}
          zoom={position.zoom}
          onMoveEnd={({ coordinates, zoom }) =>
            setPosition({ center: coordinates as [number, number], zoom })
          }
          minZoom={1}
          maxZoom={12}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="var(--color-background-100, #f1f5f9)"
                  stroke="var(--color-neutral-300, #cbd5e1)"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "var(--color-background-200, #e2e8f0)" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {markers.map((marker) => {
            const color =
              marker.online !== false
                ? TYPE_ONLINE_COLOR[marker.type]
                : TYPE_COLOR[marker.type];
            return (
              <Marker
                key={marker.id}
                coordinates={[marker.lon, marker.lat]}
                onClick={(e) => {
                  e.stopPropagation();
                  const nativeEvent = e.nativeEvent ?? (e as unknown as MouseEvent);
                  setTooltip({
                    marker,
                    x: nativeEvent.clientX,
                    y: nativeEvent.clientY,
                  });
                  onMarkerClick?.(marker);
                }}
              >
                <circle
                  r={5 / Math.sqrt(position.zoom)}
                  fill={color}
                  fillOpacity={0.9}
                  stroke="white"
                  strokeWidth={1 / position.zoom}
                  className="cursor-pointer transition-all"
                />
                {position.zoom >= 3 && (
                  <text
                    textAnchor="middle"
                    y={-8 / position.zoom}
                    style={{
                      fontSize: `${10 / position.zoom}px`,
                      fill: "var(--color-foreground-600, #475569)",
                      pointerEvents: "none",
                    }}
                  >
                    {marker.label.length > 20
                      ? marker.label.slice(0, 18) + "…"
                      : marker.label}
                  </text>
                )}
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-background border border-neutral-200 rounded-xl shadow-lg p-3 min-w-[180px] max-w-[260px]"
          style={{ top: tooltip.y + 8, left: tooltip.x + 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="absolute top-2 right-2 text-foreground-400 hover:text-foreground"
            onClick={() => setTooltip(null)}
          >
            <X size={12} />
          </button>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="flex items-center justify-center w-6 h-6 rounded-md"
              style={{ background: TYPE_COLOR[tooltip.marker.type] + "20", color: TYPE_COLOR[tooltip.marker.type] }}
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
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-2">
        {(["agent", "user", "docling", "s3"] as const)
          .filter((type) => markers.some((m) => m.type === type))
          .map((type) => (
            <div
              key={type}
              className="flex items-center gap-1 px-2 py-1 bg-background/80 backdrop-blur border border-neutral-200 rounded-full text-xs text-foreground-600"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: TYPE_COLOR[type] }}
              />
              <span className="capitalize">{type === "s3" ? "Storage" : type === "docling" ? "Docling" : type + "s"}</span>
            </div>
          ))}
      </div>
    </div>
  );
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
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                mode === m
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
