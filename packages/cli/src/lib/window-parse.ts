/**
 * Parse a human time-window spec like:
 *   "Mon-Fri 09:00-17:00"        → days Mon..Fri, 09:00–17:00
 *   "Mon,Wed,Fri 08:00-12:00"    → days Mon, Wed, Fri
 *   "Sat 10:00-14:00"            → single day
 *
 * Stored on the policy as resourceLimits.timeWindow so it is signed into the
 * agent certificate. (Runtime enforcement of the window is out of scope.)
 */

export interface TimeWindow {
  days: string[];
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_INDEX = new Map(DAYS.map((d, i) => [d.toLowerCase(), i]));

function normalizeDay(token: string): number {
  const idx = DAY_INDEX.get(token.trim().toLowerCase());
  if (idx === undefined) {
    throw new Error(
      `Invalid day "${token}". Expected one of: ${DAYS.join(", ")}`
    );
  }
  return idx;
}

function parseDays(spec: string): string[] {
  if (spec.includes("-")) {
    const [a, b] = spec.split("-");
    const start = normalizeDay(a);
    const end = normalizeDay(b);
    if (end < start) {
      throw new Error(`Invalid day range "${spec}" (end before start)`);
    }
    return DAYS.slice(start, end + 1);
  }
  // comma-separated list (or single day), de-duplicated and ordered Mon→Sun
  const indices = [...new Set(spec.split(",").map(normalizeDay))].sort(
    (x, y) => x - y
  );
  return indices.map((i) => DAYS[i]);
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

export function parseWindow(spec: string): TimeWindow {
  const trimmed = spec.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid window "${spec}". Expected e.g. "Mon-Fri 09:00-17:00".`
    );
  }
  const [daysSpec, timeSpec] = parts;
  const m = TIME_RE.exec(timeSpec);
  if (!m) {
    throw new Error(
      `Invalid time range "${timeSpec}". Expected "HH:MM-HH:MM" (24h).`
    );
  }
  const start = `${m[1]}:${m[2]}`;
  const end = `${m[3]}:${m[4]}`;
  if (start >= end) {
    throw new Error(`Invalid time range "${timeSpec}" (end must be after start).`);
  }
  return { days: parseDays(daysSpec), start, end };
}
