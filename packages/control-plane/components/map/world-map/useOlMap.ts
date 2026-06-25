"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OlMap from "ol/Map";
import OlView from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import OlFeature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import { defaults as defaultControls } from "ol/control";
import MapBrowserEvent from "ol/MapBrowserEvent";
import { buildRenderPoints } from "./clustering";
import { buildPointStyles } from "./styles";
import { isRetina, makeXYZ } from "./tiles";
import {
  MAX_MAP_ZOOM,
  type MapCluster,
  type MapMarker,
  type RenderPoint,
  type TooltipState,
} from "./types";

/**
 * Owns the OpenLayers map lifecycle (init, theme tile swap, feature sync,
 * zoom controls) plus the interaction state (tooltip / selected cluster /
 * editing marker) driven by map clicks. The view component stays declarative.
 */
export function useOlMap({
  markers,
  isDark,
  onMarkerClick,
}: {
  markers: MapMarker[];
  isDark: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
}) {
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
  const [selectedCluster, setSelectedCluster] = useState<MapCluster | null>(
    null
  );
  const [editingMarker, setEditingMarker] = useState<MapMarker | null>(null);

  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  const renderPoints = useMemo(
    () => buildRenderPoints(markers, zoom),
    [markers, zoom]
  );

  // ── Initialize map ──
  useEffect(() => {
    if (!mapDivRef.current) return;

    const tileLayer = new TileLayer({
      source: makeXYZ(isDarkRef.current, isRetina()),
    });
    tileLayerRef.current = tileLayer;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) =>
        buildPointStyles(
          feature.get("rp") as RenderPoint,
          zoomRef.current,
          isDarkRef.current
        ),
    });
    vectorLayerRef.current = vectorLayer;

    const view = new OlView({
      center: fromLonLat([0, 20]),
      zoom: 2,
      minZoom: 1,
      maxZoom: MAX_MAP_ZOOM,
    });
    viewRef.current = view;

    const map = new OlMap({
      target: mapDivRef.current,
      layers: [tileLayer, vectorLayer],
      view,
      controls: defaultControls({ zoom: false, rotate: false }),
    });
    mapRef.current = map;

    map.on("pointermove", (e) => {
      (map.getTargetElement() as HTMLElement).style.cursor =
        map.hasFeatureAtPixel(e.pixel) ? "pointer" : "";
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
          view.animate({
            center: fromLonLat([rp.cluster.lon, rp.cluster.lat]),
            zoom: Math.min(MAX_MAP_ZOOM, (view.getZoom() ?? 2) + 2),
            duration: 400,
          });
        }
      });
      if (!hit) {
        setTooltip(null);
        setEditingMarker(null);
      }
    });

    map.on("moveend", () => {
      const z = Math.round(view.getZoom() ?? 2);
      zoomRef.current = z;
      setZoom(z);
      vectorLayerRef.current?.changed();
    });

    return () => {
      map.setTarget(undefined);
      map.dispose();
      mapRef.current = null;
      viewRef.current = null;
      vectorSourceRef.current = null;
      vectorLayerRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swap tile source on theme change ──
  useEffect(() => {
    isDarkRef.current = isDark;
    tileLayerRef.current?.setSource(makeXYZ(isDark, isRetina()));
    vectorLayerRef.current?.changed();
  }, [isDark]);

  // ── Sync features ──
  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) return;
    source.clear();
    for (const rp of renderPoints) {
      const [lat, lon] =
        rp.kind === "marker"
          ? [rp.marker.lat, rp.marker.lon]
          : [rp.cluster.lat, rp.cluster.lon];
      const f = new OlFeature({ geometry: new Point(fromLonLat([lon, lat])) });
      f.setId(rp.kind === "marker" ? rp.marker.id : rp.cluster.id);
      f.set("rp", rp);
      source.addFeature(f);
    }
  }, [renderPoints]);

  // ── Zoom / view controls ──
  const zoomIn = useCallback(() => {
    viewRef.current?.animate({
      zoom: Math.min(MAX_MAP_ZOOM, (viewRef.current.getZoom() ?? 2) + 1),
      duration: 200,
    });
  }, []);
  const zoomOut = useCallback(() => {
    viewRef.current?.animate({
      zoom: Math.max(1, (viewRef.current.getZoom() ?? 2) - 1),
      duration: 200,
    });
  }, []);
  const resetView = useCallback(() => {
    viewRef.current?.animate({
      center: fromLonLat([0, 20]),
      zoom: 2,
      duration: 300,
    });
  }, []);

  return {
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
  };
}
