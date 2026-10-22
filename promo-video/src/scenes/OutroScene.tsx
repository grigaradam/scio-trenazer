import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, clamp, display, gradientText, sans } from "../theme";
import { LogoLockup, Pill, fadeUp, usePop } from "../ui";
import { Sfx } from "../audio";

const features = [
  "⏱️ Testy na čas",
  "🎯 Rozbor chyb",
  "🤖 AI trénink",
  "🔥 Gamifikace",
  "📈 Pokrok",
];

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const logo = usePop(6, 10);
  const word = usePop(30, 9);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
        opacity: interpolate(
          frame,
          [durationInFrames - 24, durationInFrames - 1],
          [1, 0],
          clamp,
        ),
      }}
    >
      <div
        style={{
          scale: logo,
          rotate: `${interpolate(logo, [0, 1], [8, 0])}deg`,
        }}
      >
        <LogoLockup size={150} />
      </div>
      <div
        style={{
          fontFamily: display,
          fontWeight: 800,
          fontSize: 112,
          letterSpacing: -4,
          lineHeight: 1.05,
          color: C.textOnDark,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <span style={fadeUp(frame, 16, 60)}>Nanečisto teď.</span>
        <span
          style={{
            ...gradientText(C.brand400, C.teal400),
            display: "inline-block",
            scale: word,
          }}
        >
          Načisto u zkoušky.
        </span>
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        {features.map((f, i) => (
          <div key={f} style={fadeUp(frame, 40 + i * 5, 30, 16)}>
            <Pill
              bg="rgba(255,255,255,0.08)"
              color={C.textOnDark}
              style={{
                fontSize: 30,
                border: "2px solid rgba(255,255,255,0.12)",
              }}
            >
              {f}
            </Pill>
          </div>
        ))}
      </div>
      <div
        style={{
          ...fadeUp(frame, 72),
          fontFamily: sans,
          fontWeight: 600,
          fontSize: 38,
          color: C.mutedOnDark,
        }}
      >
        🔒 Soukromá aplikace · registrace jen s pozvánkou
      </div>
      <Sfx name="pop" at={6} volume={0.55} />
      <Sfx name="sparkle" at={30} volume={0.5} />
    </AbsoluteFill>
  );
};
