import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Background } from "./ui";
import { Music, Sfx } from "./audio";
import { IntroScene } from "./scenes/IntroScene";
import { TestScene } from "./scenes/TestScene";
import { MistakeScene } from "./scenes/MistakeScene";
import { PracticeScene } from "./scenes/PracticeScene";
import { GamificationScene } from "./scenes/GamificationScene";
import { ProgressScene } from "./scenes/ProgressScene";
import { OutroScene } from "./scenes/OutroScene";

export const TRANSITION = 20;

export const SCENES = [
  { id: "Intro", component: IntroScene, durationInFrames: 120 },
  { id: "Testy", component: TestScene, durationInFrames: 210 },
  { id: "RozborChyb", component: MistakeScene, durationInFrames: 225 },
  { id: "Trenink", component: PracticeScene, durationInFrames: 180 },
  { id: "Gamifikace", component: GamificationScene, durationInFrames: 190 },
  { id: "Pokrok", component: ProgressScene, durationInFrames: 180 },
  { id: "Outro", component: OutroScene, durationInFrames: 150 },
] as const;

export const PROMO_DURATION =
  SCENES.reduce((sum, s) => sum + s.durationInFrames, 0) - (SCENES.length - 1) * TRANSITION;

/** Frame at which each scene starts in the main video (= start of the transition into it). */
const TRANSITION_STARTS = SCENES.slice(1).map((_, i) =>
  SCENES.slice(0, i + 1).reduce((sum, s) => sum + s.durationInFrames - TRANSITION, 0),
);

const timing = springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION });

/** Scenes are transparent; the shared background stays still underneath every transition. */
export const PromoVideo: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Music />
    {TRANSITION_STARTS.map((at) => (
      <Sfx key={at} name="whoosh" at={at - 4} volume={0.32} />
    ))}
    <TransitionSeries>
      <TransitionSeries.Sequence name="Intro" durationInFrames={120}>
        <IntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence name="Testy" durationInFrames={210}>
        <TestScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence name="RozborChyb" durationInFrames={225}>
        <MistakeScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={timing} />
      <TransitionSeries.Sequence name="Trenink" durationInFrames={180}>
        <PracticeScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence name="Gamifikace" durationInFrames={190}>
        <GamificationScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence name="Pokrok" durationInFrames={180}>
        <ProgressScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence name="Outro" durationInFrames={150}>
        <OutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

/** Wraps a single scene with the background for its standalone Studio composition. */
export const withBackground = (Scene: React.FC): React.FC => {
  const Wrapped: React.FC = () => (
    <AbsoluteFill>
      <Background />
      <Scene />
    </AbsoluteFill>
  );
  return Wrapped;
};
