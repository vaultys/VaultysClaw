import type { MapLocation } from "./types";

/** Resolve a free-text place name to coordinates via OSM Nominatim. */
export async function geocodeCity(query: string): Promise<MapLocation | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en", "User-Agent": "VaultysClaw/1.0" } }
    );
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
