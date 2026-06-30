import XYZ from "ol/source/XYZ";
import { MAX_MAP_ZOOM } from "./types";

function makeCartoCDNUrls(
  theme: "dark_all" | "light_all",
  retina: boolean
): string[] {
  const r = retina ? "@2x" : "";
  return ["a", "b", "c", "d"].map(
    (s) => `https://${s}.basemaps.cartocdn.com/${theme}/{z}/{x}/{y}${r}.png`
  );
}

export function makeXYZ(isDark: boolean, retina: boolean) {
  return new XYZ({
    urls: makeCartoCDNUrls(isDark ? "dark_all" : "light_all", retina),
    tilePixelRatio: retina ? 2 : 1,
    attributions:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: MAX_MAP_ZOOM,
  });
}

/** Whether the current display is a retina/HiDPI screen (client-only). */
export function isRetina(): boolean {
  return typeof window !== "undefined" && window.devicePixelRatio >= 2;
}
