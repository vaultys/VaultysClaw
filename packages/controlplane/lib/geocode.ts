/**
 * Resolves a free-text place name to coordinates via OSM Nominatim
 * (https://nominatim.org/release-docs/latest/api/Search/) — server-side, not
 * client-side like the old app's `geocodeCity`: Nominatim's usage policy
 * requires a real identifying User-Agent, which a browser fetch can't set,
 * and keeps this repo's one external network dependency in one place.
 */
export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

export async function geocodeCity(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`,
    { headers: { "Accept-Language": "en", "User-Agent": "VaultysClaw-Controlplane/1.0 (admin geocoding)" } }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  if (!data.length) return null;

  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  return {
    lat,
    lon,
    label: data[0].display_name?.split(",").slice(0, 3).map((s) => s.trim()).join(", ") ?? trimmed,
  };
}
