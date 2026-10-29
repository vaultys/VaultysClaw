import type { Tone } from "./Thumbnail";

type Text = { fr: string; en: string };

/**
 * What each video's thumbnail says and shows: the texts to retouch are here.
 *
 * - `hook`: 2 to 6 words, the promise or the question; `highlight` is the part of it drawn in
 *   colour (it must appear in `hook` as written).
 * - `frame`: the picture, taken from a screen recording (`screens/<video>.<lang>.mp4`, no intro,
 *   no labels; `video` defaults to the thumbnail's own name) or, for the animated videos, from the
 *   final video (`final: true`, where `at` counts the intro). `at` is in seconds of the French
 *   video; the English one is taken at the same fraction of its length, unless `atEn` is set.
 *   `mark` (with `at` as an offset) takes it from one of the recording's marks instead, the same
 *   moment in both languages. A recording made in English only (the console is English) serves
 *   both languages. `focus` (fractions of the frame) and `zoom` frame the part that must stay
 *   readable at thumbnail size.
 */
export type ThumbnailSpec = {
  eyebrow: Text;
  hook: Text;
  highlight: Text;
  sticker: Text;
  tone: Tone;
  /** The highlight's colour, when it is not the tone's. */
  accent?: Tone;
  frame: { at: number; atEn?: number; final?: boolean; video?: string; mark?: string; focus: [number, number]; zoom: number };
};

export const THUMBNAILS: Record<string, ThumbnailSpec> = {
  "console-tour": {
    eyebrow: { fr: "Visite guidée", en: "Product tour" },
    hook: { fr: "Tous vos agents IA, sous contrôle", en: "Every AI agent, under control" },
    highlight: { fr: "sous contrôle", en: "under control" },
    sticker: { fr: "En 1 minute", en: "In 1 minute" },
    tone: "orange",
    // The graph, the camera on the busiest owner: the fleet and who owns it, in one picture.
    frame: { video: "marketing-screens", mark: "graph-owner", at: 3, focus: [0.62, 0.5], zoom: 1.25 },
  },
  marketing: {
    eyebrow: { fr: "Zero Trust", en: "Zero Trust" },
    hook: { fr: "Chaque agent IA, une identité", en: "Every AI agent, an identity" },
    highlight: { fr: "une identité", en: "an identity" },
    sticker: { fr: "Certificat signé", en: "Signed certificate" },
    tone: "green",
    accent: "orange",
    // The sealed capability certificate, beside the approval in the console.
    frame: { final: true, at: 75.5, atEn: 87.5, focus: [0.74, 0.55], zoom: 1.45 },
  },
};
