import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, easeOut, gradientText, sans } from "../theme";
import { fadeUp, LogoTile, Pill, usePop } from "../ui";
import { Sfx } from "../audio";

const chips = [
  { emoji: "⏱️", label: "Testy na čas", x: -700, y: -300 },
  { emoji: "🎯", label: "Rozbor chyb", x: 640, y: -320 },
  { emoji: "🤖", label: "AI úlohy", x: -760, y: 230 },
  { emoji: "🔥", label: "Streak", x: 720, y: 250 },
  { emoji: "📈", label: "Pokrok", x: -330, y: 390 },
  { emoji: "🖍️", label: "Zvýraznění", x: 380, y: 400 },
];

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = usePop(4, 10);
  const word = usePop(48, 9);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {chips.map((c, i) => {
        const start = 30 + i * 5;
        return (
          <div
            key={c.label}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              opacity: interpolate(frame, [start, start + 16], [0, 0.9], clamp),
              translate: `calc(-50% + ${c.x + Math.sin((frame + i * 20) / 22) * 10}px) calc(-50% + ${c.y + Math.cos((frame + i * 15) / 25) * 12 + interpolate(frame, [start, start + 24], [60, 0], { ...clamp, easing: easeOut })}px)`,
            }}
          >
            <Pill
              bg="rgba(255,255,255,0.07)"
              color={C.textOnDark}
              style={{
                fontSize: 30,
                padding: "14px 28px",
                border: "2px solid rgba(255,255,255,0.12)",
              }}
            >
              <span style={{ fontSize: 36 }}>{c.emoji}</span>
              {c.label}
            </Pill>
          </div>
        );
      })}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 46,
        }}
      >
        <div
          style={{
            scale: logo,
            rotate: `${interpolate(logo, [0, 1], [-25, 0])}deg`,
          }}
        >
          <LogoTile size={190} />
        </div>

        <div
          style={{
            fontFamily: display,
            fontWeight: 800,
            fontSize: 150,
            lineHeight: 1,
            letterSpacing: -5,
            color: C.textOnDark,
            display: "flex",
            gap: 40,
            alignItems: "baseline",
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: 1500,
          }}
        >
          <span style={fadeUp(frame, 22, 70)}>Nanečisto</span>
          <span style={fadeUp(frame, 30, 70)}>teď.</span>
          <span
            style={{
              ...gradientText(C.brand400, C.teal400),
              display: "inline-block",
              scale: word,
              opacity: interpolate(frame, [48, 54], [0, 1], clamp),
            }}
          >
            Načisto u zkoušky.
          </span>
        </div>

        <div
          style={{
            ...fadeUp(frame, 64),
            fontFamily: sans,
            fontWeight: 500,
            fontSize: 44,
            color: C.mutedOnDark,
          }}
        >
          Příprava na Národní srovnávací zkoušky Scio –{" "}
          <b style={{ color: C.textOnDark }}>OSP</b>
        </div>
      </div>
      <Sfx name="pop" at={4} volume={0.55} />
      {chips.map((c, i) => (
        <Sfx key={c.label} name="tick" at={30 + i * 5} volume={0.15} />
      ))}
      <Sfx name="sparkle" at={48} volume={0.45} />
    </AbsoluteFill>
  );
};
