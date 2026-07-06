import OlStyle from "ol/style/Style";
import OlIcon from "ol/style/Icon";
import OlText from "ol/style/Text";
import OlFill from "ol/style/Fill";
import {
  DETAIL_ZOOM_LEVEL,
  TYPE_COLOR,
  TYPE_ONLINE_COLOR,
  type RenderPoint,
} from "./types";

/** Build a data-URI SVG pin (circle + tail, optional centered text). */
export function buildPinSvg({
  color,
  size,
  text = "",
}: {
  color: string;
  size: number;
  text?: string;
}) {
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = r + 2;
  const h = size + 12;
  const tw = Math.max(5, Math.round(size * 0.22));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#fff" stroke-width="2.5" paint-order="stroke"/><path d="M${cx - tw},${size - 4} L${cx},${h - 1} L${cx + tw},${size - 4}" fill="${color}"/>${text ? `<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700" font-size="${Math.max(9, Math.round(size * 0.36))}" font-family="system-ui,-apple-system,sans-serif">${text}</text>` : ""}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function pinIconStyle(src: string, size: number): OlStyle {
  const h = size + 12;
  return new OlStyle({
    image: new OlIcon({
      src,
      anchor: [0.5, (h - 1) / h],
      anchorXUnits: "fraction",
      anchorYUnits: "fraction",
      size: [size, h],
    }),
  });
}

/** OpenLayers styles for a render point (marker or cluster) at a given zoom. */
export function buildPointStyles(
  rp: RenderPoint,
  zoom: number,
  isDark: boolean
): OlStyle[] {
  const labelColor = isDark ? "#e2e8f0" : "#334155";
  const detailColor = isDark ? "#94a3b8" : "#64748b";

  if (rp.kind === "marker") {
    const { marker } = rp;
    const color =
      marker.online !== false
        ? TYPE_ONLINE_COLOR[marker.type]
        : TYPE_COLOR[marker.type];
    const size = Math.max(20, Math.min(34, 30 / Math.sqrt(Math.max(1, zoom / 2))));
    const styles: OlStyle[] = [pinIconStyle(buildPinSvg({ color, size }), size)];

    if (zoom >= 3) {
      styles.push(
        new OlStyle({
          text: new OlText({
            text:
              marker.label.length > 20
                ? marker.label.slice(0, 18) + "…"
                : marker.label,
            offsetY: -(Math.round(size / 2) + 16),
            fill: new OlFill({ color: labelColor }),
            font: `700 11px system-ui,-apple-system,sans-serif`,
          }),
        })
      );
    }
    if (zoom >= DETAIL_ZOOM_LEVEL) {
      const detail = `${marker.type === "s3" ? "storage" : marker.type}${marker.online !== undefined ? (marker.online ? " · online" : " · offline") : ""}`;
      styles.push(
        new OlStyle({
          text: new OlText({
            text: detail,
            offsetY: 12,
            fill: new OlFill({ color: detailColor }),
            font: "10px system-ui,-apple-system,sans-serif",
          }),
        })
      );
    }
    return styles;
  }

  const { cluster } = rp;
  const color = TYPE_COLOR[cluster.dominantType];
  const size = Math.max(24, Math.min(42, 36 / Math.sqrt(Math.max(1, zoom / 2))));
  const text = cluster.count > 99 ? "99+" : String(cluster.count);
  return [pinIconStyle(buildPinSvg({ color, size, text }), size)];
}
