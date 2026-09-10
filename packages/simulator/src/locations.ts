/**
 * Where simulated sensors sit on the map.
 *
 * Modelled on Bpifrance's regional network: its Maisons-Alfort head office, the regional offices
 * across metropolitan France, and the overseas ones. That shape matters more than the exact
 * addresses — a fleet clustered around Paris with a long tail across the regions and a handful of
 * points 7,000 km away in the Antilles, Guyane, La Réunion and Mayotte is what makes the map
 * exercise clustering and extent-fitting properly. A ring of fake pins around one city would not.
 *
 * **These are city-centre coordinates, not office addresses.** They place a sensor in the right
 * city, which is all a demo fleet needs; nothing here should be read as the location of a
 * particular building, and the list is not maintained against Bpifrance's actual site directory.
 */

export interface SimLocation {
  /** City name, used verbatim as the Actor's `locationLabel`. */
  label: string;
  lat: number;
  lon: number;
}

/**
 * Ordered so the first entries are the biggest sites. Assignment is by hash rather than by
 * position (see {@link locationForDid}), so the order carries no weighting — it is just readable.
 */
export const BPIFRANCE_LOCATIONS: SimLocation[] = [
  // ── Île-de-France ──
  { label: "Maisons-Alfort", lat: 48.8118, lon: 2.4372 },
  { label: "Paris", lat: 48.8566, lon: 2.3522 },

  // ── Auvergne-Rhône-Alpes ──
  { label: "Lyon", lat: 45.764, lon: 4.8357 },
  { label: "Grenoble", lat: 45.1885, lon: 5.7245 },
  { label: "Clermont-Ferrand", lat: 45.7772, lon: 3.087 },
  { label: "Saint-Étienne", lat: 45.4397, lon: 4.3872 },
  { label: "Annecy", lat: 45.8992, lon: 6.1294 },

  // ── Provence-Alpes-Côte d'Azur ──
  { label: "Marseille", lat: 43.2965, lon: 5.3698 },
  { label: "Nice", lat: 43.7102, lon: 7.262 },
  { label: "Avignon", lat: 43.9493, lon: 4.8055 },
  { label: "Toulon", lat: 43.1242, lon: 5.928 },

  // ── Occitanie ──
  { label: "Toulouse", lat: 43.6047, lon: 1.4442 },
  { label: "Montpellier", lat: 43.6108, lon: 3.8767 },
  { label: "Perpignan", lat: 42.6887, lon: 2.8948 },
  { label: "Nîmes", lat: 43.8367, lon: 4.3601 },

  // ── Nouvelle-Aquitaine ──
  { label: "Bordeaux", lat: 44.8378, lon: -0.5792 },
  { label: "Limoges", lat: 45.8336, lon: 1.2611 },
  { label: "Poitiers", lat: 46.5802, lon: 0.3404 },
  { label: "Pau", lat: 43.2951, lon: -0.3708 },
  { label: "La Rochelle", lat: 46.1603, lon: -1.1511 },
  { label: "Angoulême", lat: 45.6484, lon: 0.1562 },

  // ── Pays de la Loire ──
  { label: "Nantes", lat: 47.2184, lon: -1.5536 },
  { label: "Angers", lat: 47.4784, lon: -0.5632 },
  { label: "Le Mans", lat: 48.0061, lon: 0.1996 },
  { label: "La Roche-sur-Yon", lat: 46.6705, lon: -1.4269 },

  // ── Bretagne ──
  { label: "Rennes", lat: 48.1173, lon: -1.6778 },
  { label: "Brest", lat: 48.3904, lon: -4.4861 },
  { label: "Quimper", lat: 47.996, lon: -4.1024 },
  { label: "Saint-Brieuc", lat: 48.5144, lon: -2.7653 },
  { label: "Vannes", lat: 47.6582, lon: -2.7608 },

  // ── Normandie ──
  { label: "Rouen", lat: 49.4432, lon: 1.0999 },
  { label: "Caen", lat: 49.1829, lon: -0.3707 },
  { label: "Le Havre", lat: 49.4944, lon: 0.1079 },

  // ── Hauts-de-France ──
  { label: "Lille", lat: 50.6292, lon: 3.0573 },
  { label: "Amiens", lat: 49.8941, lon: 2.2958 },
  { label: "Arras", lat: 50.291, lon: 2.7778 },

  // ── Grand Est ──
  { label: "Strasbourg", lat: 48.5734, lon: 7.7521 },
  { label: "Nancy", lat: 48.6921, lon: 6.1844 },
  { label: "Metz", lat: 49.1193, lon: 6.1757 },
  { label: "Reims", lat: 49.2583, lon: 4.0317 },
  { label: "Mulhouse", lat: 47.7508, lon: 7.3359 },
  { label: "Troyes", lat: 48.2973, lon: 4.0744 },
  { label: "Châlons-en-Champagne", lat: 48.9566, lon: 4.3634 },

  // ── Bourgogne-Franche-Comté ──
  { label: "Dijon", lat: 47.322, lon: 5.0415 },
  { label: "Besançon", lat: 47.2378, lon: 6.0241 },

  // ── Centre-Val de Loire ──
  { label: "Orléans", lat: 47.9029, lon: 1.9093 },
  { label: "Tours", lat: 47.3941, lon: 0.6848 },
  { label: "Bourges", lat: 47.081, lon: 2.3987 },

  // ── Corse ──
  { label: "Ajaccio", lat: 41.9192, lon: 8.7386 },
  { label: "Bastia", lat: 42.7028, lon: 9.4508 },

  // ── Outre-mer ──
  // The reason the default map view has to fit an extent rather than centre on France: these are
  // thousands of kilometres away, in four directions.
  { label: "Fort-de-France", lat: 14.6161, lon: -61.0588 },
  { label: "Pointe-à-Pitre", lat: 16.2412, lon: -61.533 },
  { label: "Saint-Denis (La Réunion)", lat: -20.8823, lon: 55.4504 },
  { label: "Cayenne", lat: 4.9224, lon: -52.3135 },
  { label: "Mamoudzou", lat: -12.7806, lon: 45.2278 },
];

/**
 * Pick a location for a DID, deterministically.
 *
 * By hash rather than by round-robin so a given sensor lands in the same city on every run, even
 * when the fleet size changes or actors are approved in a different order — a demo where the map
 * rearranges itself between runs is much harder to talk over. FNV-1a: not for security, just a
 * cheap, well-spread, stable string hash.
 */
export function locationForDid(did: string): SimLocation {
  let hash = 0x811c9dc5;
  for (let i = 0; i < did.length; i++) {
    hash ^= did.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return BPIFRANCE_LOCATIONS[hash % BPIFRANCE_LOCATIONS.length];
}

/**
 * Scatter a point slightly around its city centre.
 *
 * Every sensor in one city sharing an identical coordinate would stack into a single pin that no
 * amount of zooming separates — the map's clustering would show "12" forever. A few kilometres of
 * deterministic jitter keeps them distinguishable at high zoom while still reading as one city.
 *
 * ~0.05° ≈ 5.5 km in latitude; longitude is scaled by cos(lat) so the spread stays roughly circular
 * rather than stretching into an ellipse away from the equator.
 */
export function jitterAround(location: SimLocation, did: string): { lat: number; lon: number } {
  let hash = 0x811c9dc5;
  for (let i = 0; i < did.length; i++) {
    hash ^= did.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Two independent-enough values out of the one hash.
  const a = ((hash & 0xffff) / 0xffff - 0.5) * 2;
  const b = (((hash >>> 16) & 0xffff) / 0xffff - 0.5) * 2;

  const latSpread = 0.05;
  const lonSpread = latSpread / Math.max(0.2, Math.cos((location.lat * Math.PI) / 180));

  return {
    lat: Number((location.lat + a * latSpread).toFixed(6)),
    lon: Number((location.lon + b * lonSpread).toFixed(6)),
  };
}
