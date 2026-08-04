import { CLUSTER_ZOOM_THRESHOLD, MARKER_TYPES, type MapMarker, type RenderPoint } from "./types";

function dominantTypeFromCounts(byType: Record<string, number>): string {
  let winner = MARKER_TYPES[0] as string;
  let winnerCount = byType[winner] ?? 0;
  for (const [type, count] of Object.entries(byType)) {
    if (count > winnerCount) {
      winner = type;
      winnerCount = count;
    }
  }
  return winner;
}

/**
 * Groups markers into a grid of clusters below the cluster zoom threshold;
 * above it, every marker is its own render point.
 */
export function buildRenderPoints(markers: MapMarker[], zoom: number): RenderPoint[] {
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
    const byType: Record<string, number> = {};
    for (const m of bucket) {
      lat += m.lat;
      lon += m.lon;
      byType[m.type] = (byType[m.type] ?? 0) + 1;
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
