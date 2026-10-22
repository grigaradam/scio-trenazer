import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, clamp, display, sans } from "../theme";
import { Accent, Pill, fadeUp } from "../ui";
import { Sfx } from "../audio";

// The 13 OSP task types from src/lib/content/exams.ts.
const types: { name: string; emoji: string; verbal: boolean }[] = [
  { name: "Porovnávání hodnot", emoji: "↔️", verbal: false },
  { name: "Dostatečnost údajů", emoji: "🧮", verbal: false },
  { name: "Grafy a tabulky", emoji: "📊", verbal: false },
  { name: "Slovní úlohy", emoji: "🧠", verbal: false },
  { name: "Výrazy a funkce", emoji: "➗", verbal: false },
  { name: "Úsudky s podmínkami", emoji: "🧷", verbal: false },
  { name: "Doplňování do vět", emoji: "✍️", verbal: true },
  { name: "Slovní analogie", emoji: "🔗", verbal: true },
  { name: "Synonyma a antonyma", emoji: "🔁", verbal: true },
  { name: "Nesoulad v textu", emoji: "🧩", verbal: true },
  { name: "Vyplývání z textu", emoji: "🔍", verbal: true },
  { name: "Delší text", emoji: "📖", verbal: true },
  { name: "Srovnání textů", emoji: "⚖️", verbal: true },
];
const PICK = 2;
const FOCUS = 96;

export const PracticeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const focus = spring({
    frame: frame - FOCUS,
    fps,
    config: { damping: 11, stiffness: 160 },
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 56, gap: 40 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <div style={fadeUp(frame, 2)}>
          <Pill
            bg="rgba(255,255,255,0.08)"
            color={C.brand300}
            style={{ fontSize: 30, border: "2px solid rgba(255,255,255,0.12)" }}
          >
            🤖 AI trénink
          </Pill>
        </div>
        <div
          style={{
            ...fadeUp(frame, 8, 60),
            fontFamily: display,
            fontWeight: 800,
            fontSize: 108,
            letterSpacing: -3,
            lineHeight: 1,
            color: C.textOnDark,
          }}
        >
          Nekonečný <Accent>trénink</Accent>
        </div>
        <div
          style={{
            ...fadeUp(frame, 18),
            fontFamily: sans,
            fontWeight: 500,
            fontSize: 40,
            color: C.mutedOnDark,
          }}
        >
          13 typů úloh ve stylu Scio – nové úlohy přesně na to, co ti nejde.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 18,
          width: 1640,
          marginTop: 24,
        }}
      >
        {types.map((t, i) => {
          const pop = spring({
            frame: frame - (26 + i * 3),
            fps,
            config: { damping: 13, stiffness: 180 },
          });
          const picked = i === PICK;
          return (
            <div
              key={t.name}
              style={{
                position: "relative",
                width: 300,
                height: 160,
                padding: "20px 24px",
                borderRadius: 32,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                backgroundColor: C.surface,
                border: `3px solid ${picked && frame >= FOCUS ? C.teal500 : C.border}`,
                boxShadow: picked
                  ? `0 0 0 ${interpolate(focus, [0, 1], [0, 10])}px rgba(20,184,166,0.35), 0 30px 70px rgba(8,4,24,0.5)`
                  : "0 20px 50px rgba(8,4,24,0.4)",
                fontFamily: sans,
                scale:
                  pop * (picked ? interpolate(focus, [0, 1], [1, 1.12]) : 1),
                opacity: picked
                  ? 1
                  : interpolate(frame, [FOCUS, FOCUS + 14], [1, 0.4], clamp),
                zIndex: picked ? 2 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 42 }}>{t.emoji}</span>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: t.verbal ? C.brand500 : C.teal500,
                  }}
                />
              </div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 27,
                  color: C.text,
                  lineHeight: 1.15,
                }}
              >
                {t.name}
              </span>
              {picked ? (
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -34,
                    translate: "-50% 0px",
                    scale: focus,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Pill
                    bg={C.teal500}
                    color="#fff"
                    style={{
                      fontSize: 26,
                      boxShadow: "0 12px 30px rgba(20,184,166,0.5)",
                    }}
                  >
                    ✨ Doporučeno pro tebe
                  </Pill>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        style={{
          ...fadeUp(frame, FOCUS + 18, 20),
          display: "flex",
          gap: 24,
        }}
      >
        {[
          "✅ Každá úloha prochází kontrolou kvality",
          "⚡ Vždy připravená další úloha",
        ].map((t) => (
          <Pill
            key={t}
            bg="rgba(255,255,255,0.08)"
            color={C.textOnDark}
            style={{ fontSize: 30, border: "2px solid rgba(255,255,255,0.12)" }}
          >
            {t}
          </Pill>
        ))}
      </div>
      {types.map((t, i) => (
        <Sfx key={t.name} name="tick" at={26 + i * 3} volume={0.16} />
      ))}
      <Sfx name="pop" at={FOCUS} volume={0.4} />
      <Sfx name="sparkle" at={FOCUS} volume={0.4} />
      <Sfx name="pop" at={FOCUS + 18} volume={0.22} />
    </AbsoluteFill>
  );
};
