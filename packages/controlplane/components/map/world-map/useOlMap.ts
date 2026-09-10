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
import { boundingExtent } from "ol/extent";
import { defaults as defaultControls } from "ol/control";
import MapBrowserEvent from "ol/MapBrowserEvent";
import { buildRenderPoints } from "./clustering";
import { buildPointStyles } from "./styles";
import { isRetina, makeXYZ, TILE_LAYER_CLASS } from "./tiles";
import { MAX_MAP_ZOOM, type MapCluster, type MapMarker, type RenderPoint, type TooltipState } from "./types";

/**
 * Breathing room around the fitted extent, in pixels: [top, right, bottom, left].
 *
 * Asymmetric on purpose — the zoom buttons sit top-right and the tile attribution bottom-left, so a
 * pin flush against either edge is partly under a control.
 */
const FIT_PADDING = [48, 64, 48, 48];

/**
 * How far the initial fit is allowed to zoom in.
 *
 * Only binds when the markers are tightly grouped, or when there is exactly one — where the extent
 * is a single point and an unbounded fit would land on a street corner. Roughly city level.
 */
const FIT_MAX_ZOOM = 11;

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
  /**
   * Whether the view has been fitted to the markers yet.
   *
   * The fit must happen exactly once, when markers first arrive — not on every change. Markers
   * re-cluster as the user zooms, and re-fitting on that would yank the view back the moment
   * anybody explored it.
   */
  const hasFittedRef = useRef(false);
  const isDarkRef = useRef(isDark);
  const onMarkerClickRef = useRef(onMarkerClick);

  const [zoom, setZoom] = useState(2);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<MapCluster | null>(null);
  const [editingMarker, setEditingMarker] = useState<MapMarker | null>(null);

  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  const renderPoints = useMemo(() => buildRenderPoints(markers, zoom), [markers, zoom]);

  // ── Initialize map ──
  useEffect(() => {
    if (!mapDivRef.current) return;

    const tileLayer = new TileLayer({
      source: makeXYZ(isDarkRef.current, isRetina()),
      // OpenLayers renders each layer into its own container div and puts this class on it, so the
      // dark-mode filter in globals.css applies to the basemap alone — the marker layer above is a
      // sibling and keeps its true colours (inverting those would turn every kind's colour wrong).
      className: TILE_LAYER_CLASS,
    });
    tileLayerRef.current = tileLayer;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => buildPointStyles(feature.get("rp") as RenderPoint, zoomRef.current, isDarkRef.current),
    });
    vectorLayerRef.current = vectorLayer;

    const view = new OlView({
      center: fromLonLat([0, 20]),
      zoom: 2,
      minZoom: 1,
      maxZoom: MAX_MAP_ZOOM,
    });
    viewRef.current = view;

    // Fit before the map is constructed, so its very first render is already framed on the fleet.
    //
    // This is the reliable path, and the reason it works is that `markers` is not loaded
    // asynchronously: `/admin/map` is a Server Component that fetches the located Actors and passes
    // them straight down, so they are present on the first client render — the same tick this
    // effect runs in. Fitting afterwards instead meant moving the view during or just after a
    // render pass, which repeatedly left the basemap holding a stale frame while the markers
    // themselves landed correctly.
    //
    // The size comes from the container rather than from the map, which does not exist yet and
    // would report none. `mapDivRef.current` is non-null here — the effect runs after mount.
    const el = mapDivRef.current;
    if (markers.length > 0 && el.clientWidth > 0 && el.clientHeight > 0) {
      view.fit(boundingExtent(markers.map((m) => fromLonLat([m.lon, m.lat]))), {
        size: [el.clientWidth, el.clientHeight],
        padding: FIT_PADDING,
        maxZoom: FIT_MAX_ZOOM,
      });
      hasFittedRef.current = true;
    }

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

  // ── Theme change ──
  // The basemap is a single OSM style (there is no dark tile set to swap to), so the visual change
  // is done in CSS via `TILE_LAYER_CLASS`. What still has to happen here is redrawing the vector
  // layer: marker styles are built from the theme, and OpenLayers caches them until told otherwise.
  useEffect(() => {
    isDarkRef.current = isDark;
    vectorLayerRef.current?.changed();
  }, [isDark]);

  /**
   * Frame every marker.
   *
   * `markers`, not `renderPoints`: render points are the clustered view *at the current zoom*, so
   * fitting to them would be circular — the extent would depend on the zoom it is about to set.
   * The raw markers are the actual data and do not move.
   *
   * `maxZoom` matters for the one-marker case, where the extent is a single point and an unbounded
   * fit would zoom to street level on a fleet map. `padding` keeps pins off the edges, where the
   * zoom buttons and the attribution sit.
   */
  const fitToMarkers = useCallback(
    (located: MapMarker[], duration = 0) => {
      const view = viewRef.current;
      const map = mapRef.current;
      if (!view || !map || located.length === 0) return false;

      // `fit` needs a viewport size to turn an extent into a resolution, and it takes it from the
      // map — which does not have one until OpenLayers has rendered once. Called before that, it
      // computes from `undefined` and quietly leaves the view untouched, which looked exactly like
      // "the fit does not work" while the same call from a button worked fine. Passing the size
      // explicitly, and refusing when there isn't one, makes the failure detectable by the caller.
      const size = map.getSize();
      if (!size || size[0] === 0 || size[1] === 0) return false;

      const extent = boundingExtent(located.map((m) => fromLonLat([m.lon, m.lat])));
      view.fit(extent, {
        size,
        padding: FIT_PADDING,
        maxZoom: FIT_MAX_ZOOM,
        duration,
      });
      return true;
    },
    []
  );

  // ── Sync features ──
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

  // ── Initial fit (fallback) ──
  // The construction-time fit above handles the normal case. This covers markers that genuinely
  // arrive after mount — a consumer of `WorldMap` that loads them client-side, which the admin page
  // does not do but nothing prevents. Deferred a frame so the fit is an ordinary view change rather
  // than a mutation inside OpenLayers' render cycle.
  useEffect(() => {
    if (hasFittedRef.current || markers.length === 0) return;
    const map = mapRef.current;
    if (!map) return;

    const attempt = () => {
      if (hasFittedRef.current) return;
      if (fitToMarkers(markers)) hasFittedRef.current = true;
    };

    attempt();
    if (hasFittedRef.current) return;

    // `on`, not `once`. The first `postrender` can still have no viewport size — which is exactly
    // the case this fallback exists for — and a one-shot listener is consumed by that failed
    // attempt and never fires again, leaving the map on the world view. Intermittently: whether the
    // first render already had a size depended on layout timing, so the same page sometimes fitted
    // and sometimes did not. Keep listening, and unhook on the first success.
    const onRender = () => {
      attempt();
      if (hasFittedRef.current) map.un("postrender", onRender);
    };
    map.on("postrender", onRender);
    return () => map.un("postrender", onRender);
  }, [markers, fitToMarkers]);

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
  /**
   * "Reset view" means back to the whole fleet, not back to the whole planet — with markers on the
   * map, the world view is never the thing anybody wants to return to. Falls back to the world when
   * there is nothing located, which is the only case where it is the right answer.
   */
  const resetView = useCallback(() => {
    if (fitToMarkers(markers, 300)) return;
    viewRef.current?.animate({ center: fromLonLat([0, 20]), zoom: 2, duration: 300 });
  }, [markers, fitToMarkers]);

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
