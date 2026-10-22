import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, display, easeOut } from "../theme";
import {
  Accent,
  Burst,
  Card,
  Cursor,
  FeatureLayout,
  Pill,
  SceneText,
  usePop,
} from "../ui";
import { Sfx } from "../audio";

const options = [
  "truhlář – stůl",
  "kuchař – kuchyně",
  "zedník – cihla",
  "malíř – štětec",
];
const CLICK = 100;

export const TestScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = usePop(12, 15);
  const xp = usePop(CLICK + 6, 9);
  const streak = usePop(40, 10);

  const secondsLeft = 12 * 60 + 30 - Math.floor(frame / fps);
  const timer = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const answered = frame >= CLICK;

  return (
    <>
      <Sfx name="whoosh" at={8} volume={0.25} />
      {[0, 1, 2, 3].map((i) => (
        <Sfx key={i} name="tick" at={30 + i * 6} volume={0.12} />
      ))}
      <Sfx name="pop" at={40} volume={0.35} />
      <Sfx name="click" at={CLICK - 1} volume={0.7} />
      <Sfx name="success" at={CLICK} volume={0.5} />
      <Sfx name="sparkle" at={CLICK + 2} volume={0.25} />
      <Sfx name="coin" at={CLICK + 6} volume={0.4} />
      <FeatureLayout
        left={
          <SceneText
            kicker="⏱️ Ostré testy"
            title={
              <>
                Celé testy
                <br />
                <Accent>na čas</Accent>
              </>
            }
            subtitle="Reálné testy OSP z minulých let. Odpočet, oddíly za sebou a srážka za chybu – přesně jako na ostro."
          />
        }
        right={
          <div
            style={{
              position: "relative",
              scale: interpolate(card, [0, 1], [0.85, 1]),
              opacity: card,
              translate: `${interpolate(card, [0, 1], [160, 0])}px 0px`,
              rotate: `${interpolate(card, [0, 1], [5, 0])}deg`,
            }}
          >
            <Card style={{ width: 800 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Pill bg={C.brand100} color={C.brand700}>
                  🔗 Slovní analogie
                </Pill>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <span
                    style={{ fontSize: 26, fontWeight: 700, color: C.muted }}
                  >
                    Úloha 7 / 30
                  </span>
                  <span
                    style={{
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontWeight: 700,
                      fontSize: 38,
                      padding: "6px 18px",
                      borderRadius: 16,
                      backgroundColor: C.surface2,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ⏱ {timer}
                  </span>
                </div>
              </div>

              <div
                style={{
                  height: 10,
                  borderRadius: 10,
                  backgroundColor: C.surface2,
                  marginTop: 28,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 10,
                    width: `${interpolate(frame, [CLICK, CLICK + 20], [20, 23.3], { ...clamp, easing: easeOut })}%`,
                    backgroundImage: `linear-gradient(90deg, ${C.brand500}, ${C.teal500})`,
                  }}
                />
              </div>

              <div
                style={{
                  fontFamily: display,
                  fontWeight: 700,
                  fontSize: 44,
                  whiteSpace: "nowrap",
                  margin: "38px 0 30px",
                }}
              >
                PEKAŘ : CHLÉB = ______ : ______
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 18 }}
              >
                {options.map((o, i) => {
                  const start = 30 + i * 6;
                  const correct = i === 0 && answered;
                  return (
                    <div
                      key={o}
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        gap: 22,
                        padding: "22px 28px",
                        borderRadius: 26,
                        border: `3px solid ${correct ? C.green : C.border}`,
                        backgroundColor: correct ? C.greenBg : C.surface,
                        color: correct ? C.greenText : C.text,
                        fontSize: 36,
                        fontWeight: 600,
                        opacity: interpolate(
                          frame,
                          [start, start + 14],
                          [0, 1],
                          clamp,
                        ),
                        translate: `${interpolate(frame, [start, start + 18], [40, 0], { ...clamp, easing: easeOut })}px 0px`,
                        scale:
                          i === 0
                            ? interpolate(
                                frame,
                                [CLICK, CLICK + 4, CLICK + 12],
                                [1, 0.97, 1],
                                clamp,
                              )
                            : 1,
                      }}
                    >
                      <span
                        style={{
                          color: correct ? C.green : C.muted,
                          fontWeight: 800,
                        }}
                      >
                        {"ABCD"[i]}
                      </span>
                      {o}
                      {correct ? (
                        <span style={{ marginLeft: "auto", fontSize: 40 }}>
                          ✓
                        </span>
                      ) : null}
                      {i === 0 ? (
                        <>
                          <Cursor
                            appear={58}
                            arrive={CLICK - 4}
                            from={[620, 420]}
                            to={[380, 30]}
                          />
                          <Burst at={CLICK + 2} seed="test" />
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>

            <div
              style={{
                position: "absolute",
                right: -40,
                top: -44,
                rotate: "6deg",
                scale: streak,
                padding: "16px 26px",
                borderRadius: 26,
                backgroundColor: C.orange,
                color: "#fff",
                fontFamily: display,
                fontWeight: 800,
                fontSize: 40,
                boxShadow: "0 16px 40px rgba(249,115,22,0.45)",
              }}
            >
              🔥 12 dní
            </div>

            <div
              style={{
                position: "absolute",
                right: -50,
                bottom: -36,
                rotate: "-6deg",
                scale: xp,
                translate: `0px ${interpolate(frame, [CLICK + 6, CLICK + 60], [0, -40], clamp)}px`,
                padding: "16px 28px",
                borderRadius: 26,
                backgroundColor: C.brand600,
                color: "#fff",
                fontFamily: display,
                fontWeight: 800,
                fontSize: 44,
                boxShadow: "0 16px 40px rgba(124,58,237,0.5)",
              }}
            >
              +10 XP
            </div>
          </div>
        }
      />
    </>
  );
};
