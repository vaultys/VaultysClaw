import {
  CLUSTER_ZOOM_THRESHOLD,
  MARKER_TYPES,
  type MapMarker,
  type RenderPoint,
} from "./types";

function emptyTypeCounts(): Record<MapMarker["type"], number> {
  return { agent: 0, user: 0, docling: 0, s3: 0 };
}

function dominantTypeFromCounts(
  byType: Record<MapMarker["type"], number>
): MapMarker["type"] {
  let winner: MapMarker["type"] = "agent";
  for (const type of MARKER_TYPES) {
    if (byType[type] > byType[winner]) winner = type;
  }
  return winner;
}

/**
 * Groups markers into a grid of clusters below the cluster zoom threshold;
 * above it, every marker is its own render point.
 */
export function buildRenderPoints(
  markers: MapMarker[],
  zoom: number
): RenderPoint[] {
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
    if (bucket.length === 1) {
      points.push({ kind: "marker", marker: bucket[0] });
      continue;
    }
    let lat = 0;
    let lon = 0;
    let onlineCount = 0;
    const byType = emptyTypeCounts();
    for (const m of bucket) {
      lat += m.lat;
      lon += m.lon;
      byType[m.type]++;
      if (m.online !== false) onlineCount++;
    }
    points.push({
      kind: "cluster",
      cluster: {
        id: `cluster:${key}`,
        lat: lat / bucket.length,
        lon: lon / bucket.length,
        count: bucket.length,
        markers: bucket,
        byType,
        dominantType: dominantTypeFromCounts(byType),
        onlineCount,
      },
    });
  }
  return points;
}
