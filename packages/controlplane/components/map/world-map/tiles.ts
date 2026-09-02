import XYZ from "ol/source/XYZ";
import { MAX_MAP_ZOOM } from "./types";

/**
 * Basemap tiles.
 *
 * OpenStreetMap's own tile servers: free, no API key, no account. That is the whole reason for the
 * choice — the admin console should not need a credential (or a signup) to draw a map.
 *
 * Two consequences of dropping the previous provider, both handled rather than inherited:
 *
 *  - **No dark variant exists.** OSM standard ships one style, so the theme swap is done in CSS
 *    with a filter on the tile layer (see `TILE_LAYER_CLASS` and `app/globals.css`) instead of by
 *    fetching a differently-styled tile set. Inverting a light basemap is not as good as a
 *    purpose-built dark one, but it is legible, and it costs no extra request.
 *  - **No `@2x` tiles.** OSM standard serves 256px tiles only, so retina density is not requested;
 *    asking for `@2x` returns 404s rather than sharper tiles.
 *
 * OSM's tile usage policy allows modest use like an internal console and requires the attribution
 * below; it forbids bulk or heavy automated fetching. A deployment that expects real traffic — or
 * that must not reach the public internet at all — should point at its own tile server via
 * `NEXT_PUBLIC_MAP_TILE_URL`, **and add that origin to the `img-src` allow-list in
 * `next.config.js`**, or its tiles are blocked by the CSP with only a console error to show for it.
 */

/** Marks the tile layer so CSS can filter it in dark mode. OpenLayers puts this on the layer's own
 *  container div, so the filter applies to tiles alone and never to the markers drawn above them. */
export const TILE_LAYER_CLASS = "vc-map-tiles";

/** OSM standard serves 256px tiles up to z19; asking beyond that returns errors, not detail. */
const OSM_MAX_ZOOM = 19;

const DEFAULT_OSM_URLS = [
  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
];

/**
 * A self-hosted or alternative tile template, when configured.
 *
 * `NEXT_PUBLIC_` because the URL is used by the browser; it is a public endpoint by definition, so
 * there is nothing secret to leak. An API key must **not** be embedded here — if a provider needs
 * one, proxy it server-side instead.
 */
function configuredUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim();
  return url ? url : null;
}

export function makeXYZ(_isDark: boolean, _retina: boolean) {
  const custom = configuredUrl();
  return new XYZ({
    urls: custom ? [custom] : DEFAULT_OSM_URLS,
    // 256px tiles at 1x. OSM standard has no @2x endpoint, so requesting a higher pixel ratio
    // produces misses rather than sharper output.
    tilePixelRatio: 1,
    attributions: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: Math.min(MAX_MAP_ZOOM, OSM_MAX_ZOOM),
  });
}

/**
 * Whether the current display is retina/HiDPI (client-only).
 *
 * Kept because callers still pass it through, but the basemap no longer varies on it — see the
 * `@2x` note above. Retained rather than deleted so a future self-hosted provider that *does* serve
 * high-DPI tiles has the signal already threaded through.
 */
export function isRetina(): boolean {
  return typeof window !== "undefined" && window.devicePixelRatio >= 2;
}
