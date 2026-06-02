import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const BRAND = {
  dark: "#0d1117",
  surface: "#161b22",
  border: "#30363d",
  blue: "#1d4ed8",
  blue400: "#60a5fa",
  purple: "#7c3aed",
  purple400: "#a78bfa",
  green: "#3fb950",
  text: "#e6edf3",
  muted: "#8b949e",
  pink: "#f472b6",
} as const;

export const MONO = '"JetBrains Mono","Fira Code",monospace';

/** Fade in 0→1 over `durationFrames`, starting at `startFrame` */
export function useFadeIn(startFrame: number, durationFrames = 20) {
  const frame = useCurrentFrame();
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Slide up and fade in */
export function useSlideUp(
  startFrame: number,
  durationFrames = 25,
  distance = 40
) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const y = interpolate(progress, [0, 1], [distance, 0]);
  return { opacity, y };
}

/** Scale in from 0.85 → 1 */
export function useScaleIn(startFrame: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 16, stiffness: 100 },
  });
  const scale = interpolate(progress, [0, 1], [0.85, 1]);
  const opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { scale, opacity };
}

/** Fade out at the end of a scene */
export function useFadeOut(totalFrames: number, durationFrames = 20) {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [totalFrames - durationFrames, totalFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
}

/** Combine fade-in and fade-out for a scene */
export function useSceneOpacity(
  totalFrames: number,
  fadeInFrames = 20,
  fadeOutFrames = 20
) {
  const fadeIn = useFadeIn(0, fadeInFrames);
  const fadeOut = useFadeOut(totalFrames, fadeOutFrames);
  return Math.min(fadeIn, fadeOut);
}
