/**
 * Who owns what: mapping a simulated Actor to the human it belongs to.
 *
 * `Actor.ownerDid` is the schema's "this actor belongs to / acts for that actor" edge, and it is
 * what `/admin/graph` draws and the actor detail page lists. A fleet of 7,000 Actors owned by
 * nobody renders as 7,000 disconnected dots — technically accurate about the database, and useless
 * as a picture of an estate, because the question an admin actually arrives with is *whose agent is
 * this*.
 *
 * Pure on purpose: `db.ts` applies the result, this file decides it, and the tests can check the
 * distribution without a database.
 */

/**
 * Which human, by index, owns the Actor with this DID.
 *
 * Two properties are load-bearing, both learned from `locations.ts`:
 *
 * - **Deterministic, and keyed on the DID** rather than on position in the fleet or on approval
 *   order. A demo whose ownership graph rearranges itself between runs is much harder to talk over,
 *   and approval order is not stable — it is whatever order the pending queue came back in.
 * - **Skewed, not uniform.** Hashing straight to `hash % humanCount` gives every person very nearly
 *   the same number of Actors, which no real estate looks like: most people have a laptop and one
 *   agent, and a handful of power users have a dozen. Raising the uniform hash to a power stretches
 *   the low end out into a long tail — with the default ratio the heaviest owner holds roughly four
 *   times the mean, which is a visible difference on a graph without being a pathological one.
 */
export function ownerIndexForDid(did: string, humanCount: number): number {
  if (humanCount <= 0) return -1;
  const u = unitHash(did);
  const idx = Math.floor(humanCount * Math.pow(u, OWNERSHIP_SKEW));
  // `Math.pow(u, k)` is < 1 for every u < 1, so this only trips on floating-point rounding at the
  // very top of the range — but an out-of-bounds index here would be an undefined owner DID.
  return Math.min(humanCount - 1, idx);
}

/**
 * The exponent applied to the uniform hash. 1 is uniform; higher is more skewed.
 *
 * 1.25 was chosen by looking at what it produces rather than by theory: with ~5 Actors per person,
 * the busiest owner ends up with about 20 and the quietest with about 4. Much above this and one
 * person owns a hundred things, which reads as a bug in the generator rather than as a power user.
 */
const OWNERSHIP_SKEW = 1.25;

/**
 * A uniform value in [0, 1) from a string, via FNV-1a.
 *
 * FNV rather than a crypto hash because this runs once per Actor per run and the only requirement
 * is that it spreads: there is nothing here an adversary could gain by predicting. It is also why
 * this can stay synchronous and dependency-free, which is what lets the tests assert on the whole
 * distribution at fleet scale in milliseconds.
 */
export function unitHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // The FNV prime, via shifts: `h * 16777619` overflows the 53-bit mantissa and starts losing the
    // low bits, which are exactly the ones carrying the entropy.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h / 0x100000000;
}
