import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { TRIM_VERSION, writeTrimmed } from "./prosody";

export type Lang = "fr" | "en" | "de" | "es" | "zh";
export type Localized = Partial<Record<Lang, string>>;

/** ElevenLabs voice_settings (https://elevenlabs.io/docs/api-reference/text-to-speech). */
export type VoiceSettings = { stability?: number; similarity_boost?: number; style?: number; speed?: number; use_speaker_boost?: boolean };

export type Narration = {
  /** Shown on the intro card. */
  title: Localized;
  /** Shown on the outro card, under the logo. */
  outro?: Localized;
  /** Provider and voice ids per language, and ElevenLabs settings; each one overrides the defaults below. */
  voice?: {
    provider?: Partial<Record<Lang, Provider>>;
    edge?: Localized;
    elevenlabs?: Localized;
    settings?: VoiceSettings;
    /**
     * Which neighbouring lines go with each ElevenLabs request: "both" (the default) or "previous".
     * With the next line in view the voice tends to end a statement on the rising, "it goes on"
     * intonation of a clause, then breathe in for a sentence that never comes; "previous" keeps
     * the tone running on from the line before and ends every line as a full stop.
     */
    context?: "both" | "previous";
    /** A different draw for one line, by its id (`{ "hook2": 2 }`): only that clip is regenerated. */
    seeds?: Record<string, number>;
  };
  /** Spoken form of a word, per language, merged over PRONOUNCE. The subtitles keep the written word. */
  pronounce?: Record<string, Localized>;
  lines: Record<string, Localized>;
};

export type Clip = { id: string; text: string; file: string | null; duration: number };

export type Provider = "elevenlabs" | "edge" | "none";

// Every language goes to ElevenLabs; Edge stays available per video (voice.provider) or with VIDEO_TTS.
const DEFAULT_PROVIDERS: Partial<Record<Lang, Provider>> = {};

const DEFAULT_EDGE_VOICES: Localized = {
  fr: "fr-FR-VivienneMultilingualNeural",
  en: "en-US-AvaMultilingualNeural",
  de: "de-DE-KatjaNeural",
  es: "es-ES-ElviraNeural",
  zh: "zh-CN-XiaoxiaoNeural",
};
// English is a "premade" voice, French a native voice of the library: those answer 402 on a
// free plan. eleven_multilingual_v2 makes a voice speak every language. Compare them with
// the samples in .generated-videos/voice-samples/.
const ELEVENLABS_MODEL = "eleven_multilingual_v2"; // eleven_v3 refuses previous_text/next_text
const DEFAULT_ELEVENLABS_VOICES: Localized = {
  fr: "m5U7XCsc8v988k2RJAqN", // Manon - Serious & spontaneous, a native French voice of the library
  en: "EXAVITQu4vr4xnSDxMaL",
};
// A product demo: a little livelier than the defaults (stability 0.5, style 0).
const DEFAULT_VOICE_SETTINGS: VoiceSettings = { stability: 0.45, similarity_boost: 0.75, style: 0.25, speed: 1.0, use_speaker_boost: true };
// How a French voice should say the English words of the narration: respelt the French
// way, since Edge's free service refuses SSML (<lang>, <phoneme> answer "no audio").
// Spoken text only: the subtitles keep the written word. Matched as whole words, case
// included. Samples: .generated-videos/voice-samples/pronounce-*.mp3.
const PRONOUNCE: Record<string, Localized> = {
  VaultysClaw: { fr: "Voltisse Clô" },
  VaultysID: { fr: "Voltisse aïdi" },
  Vaultys: { fr: "Voltisse" },
};

/** VIDEO_TTS forces one for every language; then the narration's, then the defaults; ElevenLabs needs its key. */
function provider(narration: Narration, lang: Lang): Provider {
  const chosen = (process.env.VIDEO_TTS as Provider | undefined) ?? narration.voice?.provider?.[lang] ?? DEFAULT_PROVIDERS[lang] ?? "elevenlabs";
  return chosen === "elevenlabs" && !process.env.ELEVENLABS_API_KEY ? "edge" : chosen;
}

export function loadNarration(specFile: string): Narration {
  const file = specFile.replace(/\.spec\.ts$/, ".narration.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function localize(text: Localized | undefined, lang: Lang, what: string): string {
  const value = text?.[lang];
  if (value === undefined) throw new Error(`Missing "${lang}" text for ${what} in the .narration.json`);
  return value;
}

function duration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(out.toString());
}

async function elevenlabs(voice: string, body: object, out: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

function edge(text: string, voice: string, out: string) {
  const args = ["--voice", voice, "--text", text, "--write-media", out];
  try {
    execFileSync("edge-tts", args, { stdio: "pipe" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    execFileSync("pipx", ["run", "edge-tts", ...args], { stdio: "pipe" });
  }
}

function spoken(text: string, lang: Lang, pronounce: Record<string, Localized>) {
  // Longest first, so that "VaultysHub" wins over "Vaultys".
  const words = Object.keys(pronounce).sort((a, b) => b.length - a.length);
  return words.reduce((t, word) => {
    const said = pronounce[word][lang];
    return said ? t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu"), said) : t;
  }, text);
}

/**
 * Synthesizes every narration line before the recording starts, so the director
 * knows how long each one lasts and can pace the actions on it.
 *
 * With ElevenLabs, each line is sent with the lines around it (previous_text /
 * next_text), so the intonation runs on from one line to the next instead of
 * restarting every time (`voice.context: "previous"` drops the next one). The video plays each
 * ElevenLabs clip with the breath after its last word cut (prosody.ts). Clips are cached by
 * everything that shapes them: editing a line regenerates it and its two neighbours, nothing else.
 */
export async function synthesize(narration: Narration, lang: Lang, cacheDir: string): Promise<Clip[]> {
  const p = provider(narration, lang);
  fs.mkdirSync(cacheDir, { recursive: true });
  const pronounce = { ...PRONOUNCE, ...narration.pronounce };
  const lines = Object.entries(narration.lines).map(([id, texts]) => {
    const text = localize(texts, lang, `line "${id}"`);
    // A French voice reads a leading ellipsis as a hesitation ("Ah…").
    if (/^\s*(…|\.\.\.)/.test(text)) throw new Error(`Line "${id}" (${lang}) starts with an ellipsis: the voice reads it as "Ah…". Start it with the words.`);
    return { id, text, said: spoken(text, lang, pronounce) };
  });
  const clips: Clip[] = [];

  for (const [i, { id, text, said }] of lines.entries()) {
    if (p === "none") {
      // No voice: keep the pacing of a calm reader (~2.6 words/s) for the subtitles.
      clips.push({ id, text, file: null, duration: Math.max(1.5, text.split(/\s+/).length / 2.6) });
      continue;
    }
    const voice =
      p === "elevenlabs" ? (narration.voice?.elevenlabs?.[lang] ?? DEFAULT_ELEVENLABS_VOICES[lang]) : (narration.voice?.edge?.[lang] ?? DEFAULT_EDGE_VOICES[lang]);
    if (!voice) throw new Error(`No ${p} voice for "${lang}": set voice.${p}.${lang} in the .narration.json`);
    const request =
      p === "elevenlabs"
        ? {
            text: said,
            model_id: ELEVENLABS_MODEL,
            language_code: lang,
            voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...narration.voice?.settings },
            previous_text: lines[i - 1]?.said,
            next_text: narration.voice?.context === "previous" ? undefined : lines[i + 1]?.said,
            seed: narration.voice?.seeds?.[id],
          }
        : { text: said };
    const hash = crypto
      .createHash("sha1")
      .update(JSON.stringify([p, voice, request]))
      .digest("hex")
      .slice(0, 16);
    const file = path.join(cacheDir, `${hash}.mp3`);
    if (!fs.existsSync(file)) {
      if (p === "elevenlabs") await elevenlabs(voice, request, file);
      else edge(said, voice, file);
    }
    // ElevenLabs often breathes in after the last word, as if the sentence went on: the video plays
    // a copy with that breath cut (prosody.ts), cached beside the clip, which stays as delivered.
    let played = file;
    if (p === "elevenlabs") {
      played = file.replace(/\.mp3$/, `.trim${TRIM_VERSION}.mp3`);
      if (!fs.existsSync(played)) writeTrimmed(file, played);
    }
    clips.push({ id, text, file: played, duration: duration(played) });
  }
  return clips;
}
