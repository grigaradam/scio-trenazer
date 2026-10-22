import React from "react";
import { Audio } from "@remotion/media";
import { interpolate, staticFile, useVideoConfig } from "remotion";
import { clamp } from "./theme";

// All audio is synthesized by scripts/synth-audio.mjs into public/audio/.
export type SfxName =
  | "click"
  | "pop"
  | "tick"
  | "whoosh"
  | "success"
  | "error"
  | "coin"
  | "levelup"
  | "sparkle"
  | "marker";

/** One-shot sound effect starting at frame `at` of the current scene. */
export const Sfx: React.FC<{ name: SfxName; at: number; volume?: number }> = ({ name, at, volume = 0.5 }) => (
  <Audio name={`SFX ${name}`} src={staticFile(`audio/${name}.wav`)} from={at} volume={volume} />
);

/** Background track (120 BPM, 38 s) with a short fade-out at the very end. */
export const Music: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio
      name="Hudba"
      src={staticFile("audio/music.wav")}
      volume={(f) => interpolate(f, [0, 6, durationInFrames - 20, durationInFrames - 1], [0, 0.42, 0.42, 0], clamp)}
    />
  );
};
