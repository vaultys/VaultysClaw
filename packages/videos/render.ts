import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { Cue, Label } from "./director";

const FADE = 0.6;

function srtTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: (Cue | Label)[], offset = 0) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(offset + c.start)} --> ${srtTime(offset + c.start + c.duration)}\n${c.text}\n`).join("\n");
}

/**
 * animated intro + screencast frames + animated outro (intro/, each with its music), cross-faded,
 * with the narration cues →
 * <name>.mp4 (H.264/AAC, no burned-in subtitles; the labels are) and <name>.srt, the
 * narration's subtitles as a separate track.
 *
 * `frames` (screencast.ts) starts at `demo.start()`, the origin of the cue times.
 */
export function render({
  frames,
  intro,
  introDuration,
  outro,
  outroDuration,
  outDir,
  name,
  cues,
  labels = [],
  duration,
  music,
}: {
  frames: string;
  /** An mp4 with an audio track (intro/render.ts). */
  intro: string;
  introDuration: number;
  /** An mp4 with an audio track (intro/render.ts). */
  outro: string;
  outroDuration: number;
  outDir: string;
  name: string;
  cues: Cue[];
  labels?: Label[];
  duration: number;
  /** Background music, looped and ducked under the voice (optional). */
  music?: string;
}) {
  fs.mkdirSync(outDir, { recursive: true });
  // The recording starts while the intro fades out; the outro, while the recording does.
  const offset = introDuration - FADE;
  const outroStart = offset + duration - FADE;
  const total = introDuration + duration + outroDuration - 2 * FADE;
  const srt = `${name}.srt`;
  fs.writeFileSync(path.join(outDir, srt), toSrt(cues, offset));
  // The labels are burned in: their .srt is removed after the render; the one that ships is the narration's.
  const labelsSrt = `${name}.labels.srt`;
  if (labels.length) fs.writeFileSync(path.join(outDir, labelsSrt), toSrt(labels, offset));

  const voiced = cues.filter((c) => c.file);
  const args = ["-y"];
  args.push("-i", path.resolve(intro));
  args.push("-f", "concat", "-safe", "0", "-i", path.resolve(frames));
  args.push("-i", path.resolve(outro));
  for (const c of voiced) args.push("-i", path.resolve(c.file!));
  if (music) args.push("-stream_loop", "-1", "-i", path.resolve(music));

  const normalize = "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,settb=AVTB";
  const filters = [
    `[0:v]${normalize}[intro]`,
    `[1:v]${normalize}[main]`,
    `[2:v]${normalize}[outro]`,
    `[intro][main]xfade=transition=fade:duration=${FADE}:offset=${offset}[im]`,
    `[im][outro]xfade=transition=fade:duration=${FADE}:offset=${outroStart.toFixed(3)}[faded]`,
    // The narration's subtitles are not burned in: they ship as <name>.srt, for players to show
    // or hide (and to carry several languages on one video).
    "[faded]null[subtitled]",
    // Labels: along the top edge, white on the console's indigo. On an SRT, libass reads Alignment
    // in the legacy SSA numbering: 6 is top centre (9 would be middle left).
    labels.length
      ? `[subtitled]subtitles=${labelsSrt}:force_style='FontName=Inter,FontSize=11,Bold=1,PrimaryColour=&H00FFFFFF,BackColour=&H20E5464F,BorderStyle=4,Outline=0,Shadow=0,Alignment=6,MarginV=3'[v]`
      : "[subtitled]null[v]",
  ];
  const audio = "aformat=sample_rates=48000:channel_layouts=stereo";
  voiced.forEach((c, i) => {
    const ms = Math.round((offset + c.start) * 1000);
    // Clips often start at full level and some stop before the sound has died out: a
    // short fade at each end, so that no line starts or stops with a click.
    filters.push(`[${i + 3}:a]${audio},afade=t=in:d=0.03,areverse,afade=t=in:d=0.15,areverse,adelay=${ms}|${ms}[a${i}]`);
  });
  if (voiced.length) filters.push(`${voiced.map((_, i) => `[a${i}]`).join("")}amix=inputs=${voiced.length}:normalize=0,apad=whole_dur=${total.toFixed(3)}[voice]`);
  // The intro's music, a little under the voice (-5 dB: louder, it jars when the narration
  // starts), faded under the cross-fade into the recording.
  filters.push(`[0:a]${audio},volume=0.56,afade=t=out:st=${(introDuration - FADE - 0.2).toFixed(3)}:d=${(FADE + 0.2).toFixed(3)},apad=whole_dur=${total.toFixed(3)}[jingle]`);
  if (music) {
    // A bed under the whole video, so the gaps between lines are not dead silence; it
    // ducks under the voice (sidechain) and fades in and out with the bumpers.
    const bed = `[${voiced.length + 3}:a]${audio},atrim=0:${total.toFixed(3)},volume=0.3,afade=t=in:d=1.5,afade=t=out:st=${(total - 3).toFixed(3)}:d=3`;
    if (voiced.length) filters.push(`${bed}[bed]`, "[voice]asplit=2[spoken][key]", "[bed][key]sidechaincompress=threshold=0.015:ratio=6:attack=80:release=900[ducked]", "[spoken][ducked]amix=inputs=2:normalize=0[mix]");
    else filters.push(`${bed}[mix]`);
  } else if (voiced.length) filters.push("[voice]anull[mix]");
  else filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${total.toFixed(3)}[mix]`);
  // The outro's music, as the outro cross-fades in after the recording.
  const outroMs = Math.round(outroStart * 1000);
  filters.push(`[2:a]${audio},volume=0.56,afade=t=in:d=${FADE},adelay=${outroMs}|${outroMs},apad=whole_dur=${total.toFixed(3)}[outroMusic]`);
  // -14 LUFS: what YouTube and LinkedIn normalize to, so the voice is neither quiet nor turned down.
  filters.push("[mix][jingle][outroMusic]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]");

  args.push("-filter_complex", filters.join(";"), "-map", "[v]");
  args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "160k");
  args.push("-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${name}.mp4`);

  // Run from outDir so the subtitles filter (the labels) gets a bare file name: it has its own escaping rules.
  try {
    execFileSync("ffmpeg", args, { cwd: outDir, stdio: "pipe" });
  } finally {
    fs.rmSync(path.join(outDir, labelsSrt), { force: true });
  }
  return path.join(outDir, `${name}.mp4`);
}
