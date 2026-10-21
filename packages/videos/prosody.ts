import { execFileSync } from "child_process";
import fs from "fs";

/**
 * The breath ElevenLabs leaves at the end of a clip: after the last word, the voice often inhales
 * as if the sentence went on (much more with next_text, but not only then), and in the video that
 * inhale sits right before a silence. tts.ts plays a trimmed copy of every clip instead.
 *
 * A breath is told apart from the last word by its shape, not its pitch (a pitch tracker hears
 * some breaths as voiced): a short sound, after a brief silence, much quieter than the speech
 * and mostly unvoiced.
 */

const RATE = 16_000;
const HOP = 0.01;
const WINDOW = 0.04;
/** Bump when the rule changes: trimmed copies are cached under it, the voice clips are not touched. */
export const TRIM_VERSION = 4;

function decode(file: string): Float32Array {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
  const out = new Float32Array(raw.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = raw.readInt16LE(i * 2) / 32768;
  return out;
}

/** Per 10 ms frame: its loudness, and whether it carries a pitch (70–350 Hz). */
function frames(x: Float32Array) {
  const n = Math.round(WINDOW * RATE);
  const hop = Math.round(HOP * RATE);
  const lo = Math.floor(RATE / 350);
  const hi = Math.floor(RATE / 70);
  const out: { rms: number; voiced: boolean }[] = [];
  for (let start = 0; start + n <= x.length; start += hop) {
    let mean = 0;
    let energy = 0;
    for (let i = 0; i < n; i++) mean += x[start + i];
    mean /= n;
    for (let i = 0; i < n; i++) energy += (x[start + i] - mean) ** 2;
    const rms = Math.sqrt(energy / n);
    let best = -Infinity;
    if (rms >= 0.01)
      for (let k = lo; k < hi; k++) {
        let c = 0;
        for (let i = 0; i + k < n; i++) c += (x[start + i] - mean) * (x[start + i + k] - mean);
        best = Math.max(best, c);
      }
    out.push({ rms, voiced: rms >= 0.01 && best > 0.5 * energy });
  }
  return out;
}

const SILENT = 0.006;

/**
 * Where to cut the clip (seconds), or null when it ends on its last word. The last sound event —
 * what follows the last silence of at least 30 ms in the final 0.9 s — is a breath when it lasts
 * 0.1 to 0.5 s, is quiet (under 55 % of the speech's loud level, its 85th percentile) and unvoiced.
 * The rule leans towards keeping: a missing breath cut is a breath, a wrong one is a missing word.
 */
export function breathCut(file: string): number | null {
  const f = frames(decode(file));
  const loud = f.filter((q) => q.rms > 0.01).map((q) => q.rms).sort((a, b) => a - b);
  if (!loud.length) return null;
  const speech = loud[Math.floor(loud.length * 0.85)];
  let end = f.length - 1;
  while (end > 0 && f[end].rms < SILENT) end--;
  let start = end;
  while (start > 0 && f[start - 1].rms >= SILENT) start--;
  let gap = start - 1;
  while (gap > 0 && f[gap].rms < SILENT) gap--;
  const gapFrames = start - 1 - gap;
  const length = (end - start + 1) * HOP;
  // Under 0.1 s it is the release of a final stop ("minute", "geste"): a breath lasts longer.
  if (gapFrames < 3 || (f.length - start) * HOP > 0.9 || length < 0.1 || length > 0.5) return null;
  const event = f.slice(start, end + 1);
  const peak = Math.max(...event.map((q) => q.rms));
  const voiced = event.filter((q) => q.voiced).length / event.length;
  // Quiet and unvoiced. Anything with voice in it may be a soft last syllable: never cut that.
  if (peak > 0.55 * speech || voiced > 0.25) return null;
  return (gap + 1) * HOP + WINDOW / 2 + 0.03;
}

/** `file` with its final breath cut off (a short fade on the cut), written to `out`. */
export function writeTrimmed(file: string, out: string) {
  const cut = breathCut(file);
  if (cut === null) {
    fs.copyFileSync(file, out);
    return 0;
  }
  const tmp = `${out}.tmp.mp3`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-t", cut.toFixed(3), "-af", `afade=t=out:st=${(cut - 0.05).toFixed(3)}:d=0.05`, "-c:a", "libmp3lame", "-b:a", "128k", tmp]);
  fs.renameSync(tmp, out);
  return cut;
}
