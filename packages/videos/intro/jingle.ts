import fs from "fs";

/**
 * The intro's music, synthesized: no track to license, deterministic, ~6 s, timed on
 * Intro.tsx. A warm pad under the Vaultys scene, a rising whoosh into the transition,
 * a soft low hit and a bell arpeggio when VaultysClaw opens, then a brighter pad that
 * fades out. A placeholder for a real composed sting: drop packages/videos/intro/music.mp3
 * (or set VIDEO_INTRO_MUSIC) and render.ts uses it instead.
 */

const RATE = 48_000;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function envelope(t: number, start: number, attack: number, end: number, release: number) {
  if (t < start || t > end + release) return 0;
  if (t < start + attack) return (t - start) / attack;
  if (t <= end) return 1;
  return 1 - (t - end) / release;
}

/** A soft pad voice: a sine and a quiet octave, slightly detuned between the channels. */
function pad(t: number, f: number, side: number) {
  const g = f + side * 0.18;
  return Math.sin(2 * Math.PI * g * t) + 0.25 * Math.sin(2 * Math.PI * 2 * g * t) + 0.08 * Math.sin(2 * Math.PI * 3 * g * t);
}

/** An FM bell: bright at the strike, mellowing as it rings. */
function bell(t: number, f: number) {
  if (t < 0) return 0;
  const index = 2.4 * Math.exp(-t / 0.35);
  return Math.sin(2 * Math.PI * f * t + index * Math.sin(2 * Math.PI * f * 3.5 * t)) * Math.exp(-t / 1.1);
}

/** Schroeder reverb on one channel: four combs into two allpasses. */
function reverb(dry: Float32Array, offset: number) {
  const out = new Float32Array(dry.length);
  for (const [ms, fb] of [
    [29.7, 0.8],
    [37.1, 0.79],
    [41.1, 0.78],
    [43.7, 0.77],
  ]) {
    const d = Math.round(((ms + offset) * RATE) / 1000);
    const buf = new Float32Array(dry.length);
    for (let i = 0; i < dry.length; i++) {
      buf[i] = dry[i] + (i >= d ? buf[i - d] * fb : 0);
      out[i] += buf[i] * 0.25;
    }
  }
  for (const [ms, g] of [
    [5, 0.7],
    [1.7, 0.7],
  ]) {
    const d = Math.round((ms * RATE) / 1000);
    const x = out.slice();
    for (let i = 0; i < out.length; i++) out[i] = -g * x[i] + (i >= d ? x[i - d] + g * out[i - d] : 0);
  }
  return out;
}

export function writeJingle(file: string, duration: number, switchAt: number) {
  const n = Math.round(duration * RATE);
  const ch = [new Float32Array(n), new Float32Array(n)];
  // Rough noise, seeded: the same file every time.
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let lp = 0;

  const padA = [50, 57, 66, 73].map(midi); // D3 A3 F#4 C#5: Dmaj7, airy
  const padB = [45, 52, 61, 64, 69].map(midi); // A2 E3 C#4 E4 A4: A major, open
  const arpeggio = [69, 73, 76, 81].map(midi); // A4 C#5 E5 A5

  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const whoosh = (() => {
      const e = envelope(t, switchAt - 0.75, 0.7, switchAt - 0.02, 0.12);
      if (!e) return 0;
      // Opening low-pass: from dull to bright as it rises.
      const a = 0.02 + 0.25 * Math.min(1, (t - (switchAt - 0.75)) / 0.75);
      lp += a * (noise() - lp);
      return lp * e * e * 0.55;
    })();
    for (const [c, side] of [
      [0, -1],
      [1, 1],
    ] as const) {
      let s = 0;
      const eA = envelope(t, 0, 1.3, switchAt - 0.25, 0.6);
      if (eA) s += (eA * padA.reduce((sum, f) => sum + pad(t, f, side), 0)) / padA.length;
      const eB = envelope(t, switchAt, 0.35, duration - 1.3, 1.25);
      if (eB) s += (1.1 * eB * padB.reduce((sum, f) => sum + pad(t, f, side), 0)) / padB.length;
      // The low hit as the circle opens.
      const tb = t - switchAt;
      if (tb >= 0) s += 0.9 * Math.sin(2 * Math.PI * (55 + 40 * Math.exp(-tb / 0.05)) * tb) * Math.exp(-tb / 0.45);
      // The arpeggio, panned left to right.
      arpeggio.forEach((f, k) => {
        const pan = -0.6 + (1.2 * k) / (arpeggio.length - 1);
        s += 0.32 * bell(t - (switchAt + 0.08 + k * 0.085), f) * (1 + side * pan) * 0.5;
      });
      ch[c][i] = s * 0.5 + whoosh * (1 + side * 0.3);
    }
  }

  const wet = [reverb(ch[0], 0), reverb(ch[1], 1.3)];
  let peak = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs((ch[c][i] = ch[c][i] * 0.78 + wet[c][i] * 0.3)));
  const gain = Math.pow(10, -3 / 20) / peak; // peak at -3 dBFS

  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    // A short fade at both ends: no click.
    const edge = Math.min(1, i / 480, (n - i) / 2400);
    for (let c = 0; c < 2; c++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[c][i] * gain * edge)) * 32767), i * 4 + c * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}
