import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, display, easeInOut } from "../theme";
import { Accent, Burst, Card, FeatureLayout, SceneText, usePop } from "../ui";
import { Sfx } from "../audio";

const days = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const badges = [
  { emoji: "🎯", title: "První krok" },
  { emoji: "🔥", title: "Týden v kuse" },
  { emoji: "⚡", title: "Série" },
  { emoji: "💎", title: "Bez chyby" },
];
const LEVEL_UP = 100;

export const GamificationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cards = usePop(10, 15);
  const levelPop = usePop(LEVEL_UP, 8);

  const streak = Math.round(
    interpolate(frame, [22, 70], [1, 12], { ...clamp, easing: easeInOut }),
  );
  const xp = Math.round(
    interpolate(frame, [36, LEVEL_UP], [840, 1000], {
      ...clamp,
      easing: easeInOut,
    }),
  );
  const leveled = frame >= LEVEL_UP;

  return (
    <>
      {days.map((d, i) => (
        <Sfx key={d} name="tick" at={29 + i * 6} volume={0.25} />
      ))}
      {[40, 60, 80].map((at) => (
        <Sfx key={at} name="coin" at={at} volume={0.25} />
      ))}
      <Sfx name="levelup" at={LEVEL_UP} volume={0.6} />
      {badges.map((b, i) => (
        <Sfx key={b.title} name="pop" at={112 + i * 8} volume={0.35} />
      ))}
      <FeatureLayout
        left={
          <SceneText
            kicker="🔥 Gamifikace"
            title={
              <>
                Motivace, <Accent>která vydrží</Accent>
              </>
            }
            subtitle="Denní cíl, streak, XP, levely a achievementy. Učení, ke kterému se chceš vracet."
            accent={[C.orange, C.brand400]}
          />
        }
        right={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              width: 860,
              opacity: cards,
              translate: `${interpolate(cards, [0, 1], [160, 0])}px 0px`,
            }}
          >
            <div style={{ display: "flex", gap: 28 }}>
              <Card
                style={{
                  flex: 1,
                  padding: 36,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span
                    style={{
                      fontSize: 96,
                      scale: 1 + Math.sin(frame / 5) * 0.07,
                      rotate: `${Math.sin(frame / 7) * 4}deg`,
                      display: "inline-block",
                    }}
                  >
                    🔥
                  </span>
                  <span
                    style={{
                      fontFamily: display,
                      fontWeight: 800,
                      fontSize: 120,
                      color: C.orange,
                      lineHeight: 1,
                    }}
                  >
                    {streak}
                  </span>
                </div>
                <span style={{ fontSize: 32, fontWeight: 700, color: C.muted }}>
                  dní v řadě
                </span>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  {days.map((d, i) => {
                    const on = interpolate(
                      frame,
                      [26 + i * 6, 32 + i * 6],
                      [0, 1],
                      clamp,
                    );
                    return (
                      <div
                        key={d}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: on > 0.5 ? C.orange : C.surface2,
                            scale: 1 + Math.sin(on * Math.PI) * 0.25,
                            display: "grid",
                            placeItems: "center",
                            color: "#fff",
                            fontSize: 22,
                            fontWeight: 800,
                          }}
                        >
                          {on > 0.5 ? "✓" : ""}
                        </div>
                        <span
                          style={{
                            fontSize: 20,
                            fontWeight: 700,
                            color: C.muted,
                          }}
                        >
                          {d}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card style={{ flex: 1, padding: 36, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 28,
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: C.brand600,
                      color: "#fff",
                      fontFamily: display,
                      fontWeight: 800,
                      fontSize: 56,
                      boxShadow: `0 6px 0 0 ${C.brand800}`,
                      scale: leveled
                        ? interpolate(levelPop, [0, 1], [0.6, 1])
                        : 1,
                    }}
                  >
                    {leveled ? 5 : 4}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span
                      style={{
                        fontFamily: display,
                        fontWeight: 800,
                        fontSize: 44,
                      }}
                    >
                      Level {leveled ? 5 : 4}
                    </span>
                    <span
                      style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: C.muted,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {xp} / 1000 XP
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: C.surface2,
                    marginTop: 34,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${interpolate(frame, [36, LEVEL_UP], [84, 100], { ...clamp, easing: easeInOut })}%`,
                      borderRadius: 15,
                      backgroundImage: `linear-gradient(90deg, ${C.brand500}, ${C.teal500})`,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 26,
                    textAlign: "center",
                    fontFamily: display,
                    fontWeight: 800,
                    fontSize: 46,
                    color: C.brand600,
                    scale: levelPop,
                  }}
                >
                  LEVEL UP! 🎉
                </div>
                <Burst at={LEVEL_UP} seed="level" distance={260} count={24} />
                {[40, 60, 80].map((at) => (
                  <div
                    key={at}
                    style={{
                      position: "absolute",
                      right: 40,
                      top: 60,
                      fontFamily: display,
                      fontWeight: 800,
                      fontSize: 34,
                      color: C.brand600,
                      opacity: interpolate(
                        frame,
                        [at, at + 5, at + 18, at + 26],
                        [0, 1, 1, 0],
                        clamp,
                      ),
                      translate: `0px ${interpolate(frame, [at, at + 26], [20, -60], clamp)}px`,
                    }}
                  >
                    +10 XP
                  </div>
                ))}
              </Card>
            </div>

            <Card style={{ padding: 36 }}>
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: 36,
                  marginBottom: 26,
                }}
              >
                Nové achievementy
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                {badges.map((b, i) => {
                  const pop = spring({
                    frame: frame - (112 + i * 8),
                    fps,
                    config: { damping: 9, stiffness: 170 },
                  });
                  return (
                    <div
                      key={b.title}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 14,
                        width: 170,
                      }}
                    >
                      <div
                        style={{
                          width: 120,
                          height: 120,
                          borderRadius: 60,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 60,
                          backgroundImage: `linear-gradient(135deg, ${C.brand100}, ${C.teal100})`,
                          border: `4px solid ${C.brand300}`,
                          scale: pop,
                          rotate: `${interpolate(pop, [0, 1], [-40, 0])}deg`,
                        }}
                      >
                        {b.emoji}
                      </div>
                      <span
                        style={{ fontSize: 26, fontWeight: 700, opacity: pop }}
                      >
                        {b.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        }
      />
    </>
  );
};
