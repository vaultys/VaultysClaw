export interface GeoLocation {
  lat: number;
  lon: number;
  label: string;
}

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fc/,
  /^fd/,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

// Lazy singleton — loaded once on first call, null if unavailable.
let geoipLib: { lookup: (ip: string) => { ll: [number, number]; city?: string; region?: string; country?: string } | null } | null | undefined = undefined;

async function getGeoip() {
  if (geoipLib !== undefined) return geoipLib;
  try {
    const mod = await import("geoip-lite");
    geoipLib = mod.default ?? (mod as unknown as typeof geoipLib);
  } catch {
    geoipLib = null;
  }
  return geoipLib;
}

/** Resolve a raw WebSocket connection IP to a GeoLocation, or null if unresolvable. */
export async function geolocateIp(ip: string): Promise<GeoLocation | null> {
  const cleaned = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isPrivateIp(cleaned)) return null;

  const lib = await getGeoip();
  if (!lib) return null;

  try {
    const geo = lib.lookup(cleaned);
    if (!geo || !geo.ll[0] || !geo.ll[1]) return null;

    const parts: string[] = [];
    if (geo.city) parts.push(geo.city);
    if (geo.region) parts.push(geo.region);
    if (geo.country) parts.push(geo.country);

    return {
      lat: geo.ll[0],
      lon: geo.ll[1],
      label: parts.join(", ") || cleaned,
    };
  } catch {
    return null;
  }
}
