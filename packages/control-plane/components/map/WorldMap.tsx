"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { Bot, User, Database, Server, MapPin, X, RotateCcw, Plus, Minus } from "lucide-react";
import OlMap from "ol/Map";
import OlView from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import OlFeature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import OlStyle from "ol/style/Style";
import OlIcon from "ol/style/Icon";
import OlText from "ol/style/Text";
import OlFill from "ol/style/Fill";
import { defaults as defaultControls } from "ol/control";
import MapBrowserEvent from "ol/MapBrowserEvent";

// ── Types & constants ──────────────────────────────────────────────────────

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

// ── Clustering ─────────────────────────────────────────────────────────────

function emptyTypeCounts(): Record<MapMarker["type"], number> {
  return { agent: 0, user: 0, docling: 0, s3: 0 };
}

function dominantTypeFromCounts(byType: Record<MapMarker["type"], number>): MapMarker["type"] {
  let winner: MapMarker["type"] = "agent";
  for (const type of ["agent", "user", "docling", "s3"] as const) {
    if (byType[type] > byType[winner]) winner = type;
  }
  return winner;
}

function buildRenderPoints(markers: MapMarker[], zoom: number): RenderPoint[] {
  if (zoom >= CLUSTER_ZOOM_THRESHOLD) {
    return markers.map((marker) => ({ kind: "marker", marker }));
  }
  const cellSize = Math.max(0.8, 14 / Math.max(1, zoom));
  const buckets = new Map<string, MapMarker[]>();
  for (const marker of markers) {
    const key = `${Math.floor((marker.lat + 90) / cellSize)}:${Math.floor((marker.lon + 180) / cellSize)}`;
    const b = buckets.get(key);
    if (b) b.push(marker);
    else buckets.set(key, [marker]);
  }
  const points: RenderPoint[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length === 1) { points.push({ kind: "marker", marker: bucket[0] }); continue; }
    let lat = 0, lon = 0, onlineCount = 0;
    const byType = emptyTypeCounts();
    for (const m of bucket) { lat += m.lat; lon += m.lon; byType[m.type]++; if (m.online !== false) onlineCount++; }
    points.push({ kind: "cluster", cluster: { id: `cluster:${key}`, lat: lat / bucket.length, lon: lon / bucket.length, count: bucket.length, markers: bucket, byType, dominantType: dominantTypeFromCounts(byType), onlineCount } });
  }
  return points;
}

// ── SVG pin ────────────────────────────────────────────────────────────────

function buildPinSvg({ color, size, text = "" }: { color: string; size: number; text?: string }) {
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = r + 2;
  const h = size + 12;
  const tw = Math.max(5, Math.round(size * 0.22));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#fff" stroke-width="2.5" paint-order="stroke"/><path d="M${cx - tw},${size - 4} L${cx},${h - 1} L${cx + tw},${size - 4}" fill="${color}"/>${text ? `<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700" font-size="${Math.max(9, Math.round(size * 0.36))}" font-family="system-ui,-apple-system,sans-serif">${text}</text>` : ""}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// ── OL style builder ───────────────────────────────────────────────────────

function buildPointStyles(rp: RenderPoint, zoom: number, isDark: boolean): OlStyle[] {
  const labelColor = isDark ? "#e2e8f0" : "#334155";
  const detailColor = isDark ? "#94a3b8" : "#64748b";

  if (rp.kind === "marker") {
    const { marker } = rp;
    const color = marker.online !== false ? TYPE_ONLINE_COLOR[marker.type] : TYPE_COLOR[marker.type];
    const size = Math.max(20, Math.min(34, 30 / Math.sqrt(Math.max(1, zoom / 2))));
    const h = size + 12;
    const styles: OlStyle[] = [
      new OlStyle({
        image: new OlIcon({ src: buildPinSvg({ color, size }), anchor: [0.5, (h - 1) / h], anchorXUnits: "fraction", anchorYUnits: "fraction", size: [size, h] }),
      }),
    ];
    if (zoom >= 3) {
      styles.push(new OlStyle({ text: new OlText({ text: marker.label.length > 20 ? marker.label.slice(0, 18) + "…" : marker.label, offsetY: -(Math.round(size / 2) + 16), fill: new OlFill({ color: labelColor }), font: `700 11px system-ui,-apple-system,sans-serif` }) }));
    }
    if (zoom >= DETAIL_ZOOM_LEVEL) {
      const detail = `${marker.type === "s3" ? "storage" : marker.type}${marker.online !== undefined ? (marker.online ? " · online" : " · offline") : ""}`;
      styles.push(new OlStyle({ text: new OlText({ text: detail, offsetY: 12, fill: new OlFill({ color: detailColor }), font: "10px system-ui,-apple-system,sans-serif" }) }));
    }
    return styles;
  }

  const { cluster } = rp;
  const color = TYPE_COLOR[cluster.dominantType];
  const size = Math.max(24, Math.min(42, 36 / Math.sqrt(Math.max(1, zoom / 2))));
  const h = size + 12;
  const text = cluster.count > 99 ? "99+" : String(cluster.count);
  return [new OlStyle({ image: new OlIcon({ src: buildPinSvg({ color, size, text }), anchor: [0.5, (h - 1) / h], anchorXUnits: "fraction", anchorYUnits: "fraction", size: [size, h] }) })];
}

// ── Tile URL helper ────────────────────────────────────────────────────────

function makeCartoCDNUrls(theme: "dark_all" | "light_all", retina: boolean): string[] {
  const r = retina ? "@2x" : "";
  return ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/${theme}/{z}/{x}/{y}${r}.png`);
}

function makeXYZ(isDark: boolean, retina: boolean) {
  return new XYZ({
    urls: makeCartoCDNUrls(isDark ? "dark_all" : "light_all", retina),
    tilePixelRatio: retina ? 2 : 1,
    attributions: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: MAX_MAP_ZOOM,
  });
}

// ── Sidebar icon ───────────────────────────────────────────────────────────

function MarkerIcon({ type, size = 14 }: { type: MapMarker["type"]; size?: number }) {
  const p = { size, strokeWidth: 2 };
  if (type === "agent") return <Bot {...p} />;
  if (type === "user") return <User {...p} />;
  if (type === "docling") return <Server {...p} />;
  return <Database {...p} />;
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  markers: MapMarker[];
  height?: number;
  className?: string;
  onMarkerClick?: (marker: MapMarker) => void;
  onSaveLocation?: (marker: MapMarker, loc: { lat: number; lon: number; label: string } | null) => Promise<void>;
  canEditLocation?: boolean | ((marker: MapMarker) => boolean);
}

// ── Map component ──────────────────────────────────────────────────────────

function MapInner({ markers, height = 400, className, onMarkerClick, onSaveLocation, canEditLocation = false }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const viewRef = useRef<OlView | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const vectorLayerRef = useRef<VectorLayer | null>(null);
  const tileLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const zoomRef = useRef(2);
  const isDarkRef = useRef(isDark);
  const onMarkerClickRef = useRef(onMarkerClick);

  const [zoom, setZoom] = useState(2);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<MapCluster | null>(null);
  const [editingMarker, setEditingMarker] = useState<MapMarker | null>(null);

  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);

  const renderPoints = useMemo(() => buildRenderPoints(markers, zoom), [markers, zoom]);

  const isEditable = useCallback((marker: MapMarker) => {
    if (!onSaveLocation) return false;
    return typeof canEditLocation === "function" ? canEditLocation(marker) : canEditLocation;
  }, [canEditLocation, onSaveLocation]);

  const handleSaveLocation = useCallback(async (loc: { lat: number; lon: number; label: string } | null) => {
    if (!editingMarker || !onSaveLocation) return;
    await onSaveLocation(editingMarker, loc);
    setEditingMarker(null);
    setTooltip(null);
  }, [editingMarker, onSaveLocation]);

  // ── Initialize OL map ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current) return;

    const retina = typeof window !== "undefined" && window.devicePixelRatio >= 2;
    const tileLayer = new TileLayer({ source: makeXYZ(isDarkRef.current, retina) });
    tileLayerRef.current = tileLayer;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => buildPointStyles(feature.get("rp") as RenderPoint, zoomRef.current, isDarkRef.current),
    });
    vectorLayerRef.current = vectorLayer;

    const view = new OlView({ center: fromLonLat([0, 20]), zoom: 2, minZoom: 1, maxZoom: MAX_MAP_ZOOM });
    viewRef.current = view;

    const map = new OlMap({
      target: mapDivRef.current,
      layers: [tileLayer, vectorLayer],
      view,
      controls: defaultControls({ zoom: false, rotate: false }),
    });
    mapRef.current = map;

    map.on("pointermove", (e) => {
      (map.getTargetElement() as HTMLElement).style.cursor = map.hasFeatureAtPixel(e.pixel) ? "pointer" : "";
    });

    map.on("click", (e) => {
      const me = e as MapBrowserEvent<PointerEvent>;
      let hit = false;
      map.forEachFeatureAtPixel(me.pixel, (fl) => {
        if (hit) return;
        hit = true;
        const rp = fl.get("rp") as RenderPoint;
        const { clientX, clientY } = me.originalEvent;
        if (rp.kind === "marker") {
          setTooltip({ kind: "marker", marker: rp.marker, x: clientX, y: clientY });
          onMarkerClickRef.current?.(rp.marker);
        } else {
          setSelectedCluster(rp.cluster);
          view.animate({ center: fromLonLat([rp.cluster.lon, rp.cluster.lat]), zoom: Math.min(MAX_MAP_ZOOM, (view.getZoom() ?? 2) + 2), duration: 400 });
        }
      });
      if (!hit) { setTooltip(null); setEditingMarker(null); }
    });

    map.on("moveend", () => {
      const z = Math.round(view.getZoom() ?? 2);
      zoomRef.current = z;
      setZoom(z);
      vectorLayerRef.current?.changed();
    });

    return () => { map.setTarget(undefined); map.dispose(); mapRef.current = null; viewRef.current = null; vectorSourceRef.current = null; vectorLayerRef.current = null; tileLayerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swap tile source on theme change ─────────────────────────────────────
  useEffect(() => {
    isDarkRef.current = isDark;
    const retina = typeof window !== "undefined" && window.devicePixelRatio >= 2;
    tileLayerRef.current?.setSource(makeXYZ(isDark, retina));
    vectorLayerRef.current?.changed();
  }, [isDark]);

  // ── Sync features ─────────────────────────────────────────────────────────
  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) return;
    source.clear();
    for (const rp of renderPoints) {
      const [lat, lon] = rp.kind === "marker" ? [rp.marker.lat, rp.marker.lon] : [rp.cluster.lat, rp.cluster.lon];
      const f = new OlFeature({ geometry: new Point(fromLonLat([lon, lat])) });
      f.setId(rp.kind === "marker" ? rp.marker.id : rp.cluster.id);
      f.set("rp", rp);
      source.addFeature(f);
    }
  }, [renderPoints]);

  // ── Zoom callbacks ─────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => { viewRef.current?.animate({ zoom: Math.min(MAX_MAP_ZOOM, (viewRef.current.getZoom() ?? 2) + 1), duration: 200 }); }, []);
  const zoomOut = useCallback(() => { viewRef.current?.animate({ zoom: Math.max(1, (viewRef.current.getZoom() ?? 2) - 1), duration: 200 }); }, []);
  const resetView = useCallback(() => { viewRef.current?.animate({ center: fromLonLat([0, 20]), zoom: 2, duration: 300 }); }, []);

  return (
    <div className={`relative flex select-none ${className ?? ""}`} style={{ height }}>
      <div className="flex-1 relative">
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} className="rounded-l-lg" />

        <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1">
          <button onClick={zoomOut} className="p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors" title="Zoom out"><Minus size={14} /></button>
          <button onClick={zoomIn} className="p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors" title="Zoom in"><Plus size={14} /></button>
          <button onClick={resetView} className="p-1.5 bg-background-100 border border-neutral-200 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors" title="Reset view"><RotateCcw size={14} /></button>
        </div>
      </div>

      {selectedCluster && (
        <div className="w-80 border-l border-neutral-200 bg-background flex flex-col overflow-hidden rounded-r-lg shadow-md">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-background-50">
            <h3 className="font-semibold text-foreground text-sm">Cluster Details</h3>
            <button onClick={() => setSelectedCluster(null)} className="text-foreground-400 hover:text-foreground transition-colors"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-md text-white text-xs font-bold" style={{ background: TYPE_COLOR[selectedCluster.dominantType] }}>{selectedCluster.count}</span>
                <span className="text-sm font-medium text-foreground">{selectedCluster.count} markers</span>
              </div>
              <div className="text-xs text-foreground-500 space-y-1 ml-8">
                <div>{selectedCluster.onlineCount} online</div>
                <div className="text-foreground-400">{selectedCluster.lat.toFixed(4)}, {selectedCluster.lon.toFixed(4)}</div>
              </div>
            </div>
            <div className="pt-2 border-t border-neutral-200">
              <h4 className="text-xs font-medium text-foreground mb-2 uppercase tracking-wide text-foreground-600">By Type</h4>
              <div className="space-y-1 text-xs text-foreground-500">
                {(["agent", "user", "docling", "s3"] as const).filter((t) => selectedCluster.byType[t] > 0).map((type) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: TYPE_COLOR[type] }} />{type === "s3" ? "Storage" : type === "docling" ? "Docling" : `${type}s`}</span>
                    <span className="text-foreground font-medium">{selectedCluster.byType[type]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-neutral-200">
              <h4 className="text-xs font-medium text-foreground mb-2 uppercase tracking-wide text-foreground-600">Markers</h4>
              <div className="space-y-2">
                {selectedCluster.markers.map((marker) => (
                  <div key={marker.id} className="text-xs bg-background-100 rounded-lg p-2 cursor-pointer hover:bg-background-200 transition-colors" onClick={() => onMarkerClick?.(marker)}>
                    <div className="flex items-start gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 mt-0.5" style={{ background: TYPE_COLOR[marker.type] + "20", color: TYPE_COLOR[marker.type] }}><MarkerIcon type={marker.type} size={11} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{marker.label}</div>
                        <div className="text-foreground-400 capitalize text-[10px] mt-0.5">
                          {marker.type === "s3" ? "Storage" : marker.type}
                          {marker.online !== undefined && <span className="ml-1">{marker.online ? "🟢" : "⚪"}</span>}
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
        <div className="fixed z-50 bg-background border border-neutral-200 rounded-xl shadow-lg p-3 min-w-[180px] max-w-[260px]" style={{ top: tooltip.y + 8, left: tooltip.x + 8 }} onClick={(e) => e.stopPropagation()}>
          <button className="absolute top-2 right-2 text-foreground-400 hover:text-foreground" onClick={() => { setTooltip(null); setEditingMarker(null); }}><X size={12} /></button>
          {tooltip.kind === "marker" && tooltip.marker && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-md" style={{ background: TYPE_COLOR[tooltip.marker.type] + "20", color: TYPE_COLOR[tooltip.marker.type] }}><MarkerIcon type={tooltip.marker.type} size={13} /></span>
                <span className="text-xs font-semibold text-foreground truncate pr-4">{tooltip.marker.label}</span>
              </div>
              <div className="text-xs text-foreground-500 space-y-0.5">
                <div className="capitalize">{tooltip.marker.type}</div>
                {tooltip.marker.online !== undefined && (
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${tooltip.marker.online ? "bg-green-500" : "bg-neutral-400"}`} />
                    {tooltip.marker.online ? "Online" : "Offline"}
                  </div>
                )}
                <div className="text-foreground-400">{tooltip.marker.lat.toFixed(4)}, {tooltip.marker.lon.toFixed(4)}</div>
                {tooltip.marker.type === "agent" && typeof tooltip.marker.meta?.did === "string" && (
                  <Link href={`/agents/${tooltip.marker.meta.did}`} className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500">
                    View agent page →
                  </Link>
                )}
                {isEditable(tooltip.marker) && (
                  <button onClick={() => setEditingMarker(tooltip.marker!)} className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-500">Edit location</button>
                )}
              </div>
            </>
          )}
          {tooltip.kind === "cluster" && tooltip.cluster && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-md text-white text-[10px] font-bold" style={{ background: TYPE_COLOR[tooltip.cluster.dominantType] }}>{tooltip.cluster.count}</span>
                <span className="text-xs font-semibold text-foreground truncate pr-4">{tooltip.cluster.count} clustered markers</span>
              </div>
              <div className="text-xs text-foreground-500 space-y-0.5">
                <div>{tooltip.cluster.onlineCount} online</div>
                <div className="text-foreground-400">{tooltip.cluster.lat.toFixed(4)}, {tooltip.cluster.lon.toFixed(4)}</div>
                <div className="pt-1 text-primary-600">Click to view details</div>
              </div>
            </>
          )}
        </div>
      )}

      {editingMarker && onSaveLocation && (
        <LocationEditor current={{ lat: editingMarker.lat, lon: editingMarker.lon, label: editingMarker.label }} onSave={handleSaveLocation} onClose={() => setEditingMarker(null)} />
      )}
    </div>
  );
}

const DynamicMapInner = dynamic(() => Promise.resolve(MapInner), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: "400px" }} className="bg-background-100 rounded-lg animate-pulse" />,
});

export function WorldMap(props: Props) {
  return <DynamicMapInner {...props} />;
}

// ── Geocode helper ─────────────────────────────────────────────────────────

interface GeocodeResult { lat: number; lon: number; label: string; }

export async function geocodeCity(query: string): Promise<GeocodeResult | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, { headers: { "Accept-Language": "en", "User-Agent": "VaultysClaw/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), label: data[0].display_name?.split(",").slice(0, 3).join(", ") ?? query };
  } catch { return null; }
}

// ── Location editor modal ──────────────────────────────────────────────────

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
    setError(""); setLoading(true);
    try {
      if (mode === "city") {
        const result = await geocodeCity(city);
        if (!result) { setError("City not found. Try a more specific name or use coordinates."); setLoading(false); return; }
        await onSave(result);
      } else {
        const latN = parseFloat(lat), lonN = parseFloat(lon);
        if (isNaN(latN) || isNaN(lonN)) { setError("Invalid coordinates."); setLoading(false); return; }
        await onSave({ lat: latN, lon: lonN, label: label || `${latN.toFixed(4)}, ${lonN.toFixed(4)}` });
      }
      onClose();
    } catch { setError("Failed to save location."); } finally { setLoading(false); }
  };

  const handleClear = async () => { setLoading(true); try { await onSave(null); onClose(); } finally { setLoading(false); } };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-background border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><MapPin size={16} className="text-primary-600" /><h3 className="font-semibold text-foreground">Set Location</h3></div>
          <button onClick={onClose} className="text-foreground-400 hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="flex gap-1 mb-4 bg-background-100 rounded-lg p-1">
          {(["city", "coords"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-foreground-500 hover:text-foreground"}`}>
              {m === "city" ? "City name" : "Coordinates"}
            </button>
          ))}
        </div>
        {mode === "city" ? (
          <input type="text" placeholder="e.g. Paris, France" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} className="w-full px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400" autoFocus />
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input type="number" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} className="flex-1 px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400" />
              <input type="number" placeholder="Longitude" value={lon} onChange={(e) => setLon(e.target.value)} className="flex-1 px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400" />
            </div>
            <input type="text" placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400" />
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        {current && <p className="mt-2 text-xs text-foreground-500">Current: {current.label} ({current.lat.toFixed(4)}, {current.lon.toFixed(4)})</p>}
        <div className="flex gap-2 mt-4">
          {current && <button onClick={handleClear} disabled={loading} className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg border border-red-200 transition-colors disabled:opacity-50">Clear</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-3 py-2 text-xs text-foreground-500 hover:text-foreground rounded-lg border border-neutral-200 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={loading || (mode === "city" ? !city.trim() : !lat || !lon)} className="px-4 py-2 text-xs bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50">{loading ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
