import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, easeInOut, easeOut } from "../theme";
import {
  Accent,
  Card,
  FeatureLayout,
  Pill,
  SceneText,
  fadeUp,
  usePop,
} from "../ui";
import { Sfx } from "../audio";

const options = ["A > B", "A < B", "A = B", "Nelze určit"];
const WRONG = 1;
const RIGHT = 2;
const SHAKE = 40;
const RETRY = 78;

const Marker: React.FC<{ children: React.ReactNode; start: number }> = ({
  children,
  start,
}) => {
  const frame = useCurrentFrame();
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(100deg, rgba(253,224,71,0) 0%, rgba(253,224,71,0.9) 6%, rgba(253,224,71,0.75) 94%, rgba(253,224,71,0) 100%)`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "0 70%",
        backgroundSize: `${interpolate(frame, [start, start + 26], [0, 100], { ...clamp, easing: easeInOut })}% 78%`,
        borderRadius: 6,
        padding: "0 6px",
      }}
    >
      {children}
    </span>
  );
};

const Underline: React.FC<{ children: React.ReactNode; start: number }> = ({
  children,
  start,
}) => {
  const frame = useCurrentFrame();
  return (
    <strong
      style={{
        color: C.brand700,
        backgroundImage: "linear-gradient(currentColor, currentColor)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "0 100%",
        backgroundSize: `${interpolate(frame, [start, start + 18], [0, 100], { ...clamp, easing: easeOut })}% 4px`,
      }}
    >
      {children}
    </strong>
  );
};

export const MistakeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const card = usePop(12, 15);
  const explain = usePop(96, 14);

  const decay = interpolate(frame, [SHAKE, SHAKE + 16], [1, 0], clamp);
  const shake =
    frame >= SHAKE ? Math.sin((frame - SHAKE) * 1.6) * 18 * decay : 0;

  return (
    <>
      <Sfx name="whoosh" at={8} volume={0.25} />
      <Sfx name="click" at={SHAKE - 3} volume={0.6} />
      <Sfx name="error" at={SHAKE} volume={0.45} />
      <Sfx name="click" at={RETRY - 3} volume={0.5} />
      <Sfx name="success" at={RETRY} volume={0.5} />
      <Sfx name="pop" at={96} volume={0.4} />
      <Sfx name="tick" at={120} volume={0.3} />
      <Sfx name="tick" at={136} volume={0.3} />
      <Sfx name="marker" at={156} volume={0.35} />
      <FeatureLayout
        left={
          <SceneText
            kicker="🎯 Rozbor chyb"
            title={
              <>
                Z každé chyby
                <br />
                <Accent>se poučíš</Accent>
              </>
            }
            subtitle="Nejdřív si úlohu zkusíš přepočítat sám. Pak ti AI lektor vysvětlí řešení krok za krokem."
            accent={[C.teal400, C.brand400]}
          />
        }
        right={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              scale: interpolate(card, [0, 1], [0.85, 1]),
              opacity: card,
              translate: `${interpolate(card, [0, 1], [160, 0])}px 0px`,
            }}
          >
            <Card style={{ width: 820, padding: 38 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Pill bg={C.teal100} color={C.teal700}>
                  ↔️ Porovnávání hodnot
                </Pill>
                <span
                  style={{
                    ...fadeUp(frame, SHAKE + 4, 10, 12),
                    fontSize: 28,
                    fontWeight: 700,
                    color: frame >= RETRY ? C.green : C.red,
                  }}
                >
                  {frame >= RETRY ? "Opraveno 💪" : "Zkus to znovu"}
                </span>
              </div>
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 700,
                  fontSize: 42,
                  margin: "28px 0 24px",
                }}
              >
                A = ¾ ze 120 &nbsp;·&nbsp; B = ⅚ ze 108
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                {options.map((o, i) => {
                  const wrong = i === WRONG && frame >= SHAKE;
                  const right = i === RIGHT && frame >= RETRY;
                  return (
                    <div
                      key={o}
                      style={{
                        display: "flex",
                        gap: 18,
                        alignItems: "center",
                        padding: "20px 26px",
                        borderRadius: 24,
                        fontSize: 34,
                        fontWeight: 700,
                        border: `3px solid ${right ? C.green : wrong ? C.red : C.border}`,
                        backgroundColor: right
                          ? C.greenBg
                          : wrong
                            ? C.redBg
                            : C.surface,
                        color: right ? C.greenText : wrong ? C.redText : C.text,
                        translate: i === WRONG ? `${shake}px 0px` : undefined,
                        scale: right
                          ? interpolate(
                              frame,
                              [RETRY, RETRY + 5, RETRY + 12],
                              [1, 1.05, 1],
                              clamp,
                            )
                          : 1,
                        opacity:
                          wrong && frame >= RETRY
                            ? 0.55
                            : interpolate(
                                frame,
                                [22 + i * 4, 34 + i * 4],
                                [0, 1],
                                clamp,
                              ),
                      }}
                    >
                      <span style={{ opacity: 0.6 }}>{"ABCD"[i]}</span>
                      {o}
                      <span style={{ marginLeft: "auto" }}>
                        {right ? "✓" : wrong ? "✗" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card
              style={{
                width: 820,
                padding: 38,
                backgroundColor: "#faf9fd",
                opacity: explain,
                translate: `0px ${interpolate(explain, [0, 1], [60, 0])}px`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  marginBottom: 22,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 20,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 36,
                    backgroundImage: `linear-gradient(135deg, ${C.brand500}, ${C.teal500})`,
                  }}
                >
                  🤖
                </div>
                <span
                  style={{ fontFamily: display, fontWeight: 800, fontSize: 36 }}
                >
                  AI lektor vysvětluje
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  fontSize: 34,
                  lineHeight: 1.45,
                }}
              >
                <div style={fadeUp(frame, 108, 20, 14)}>
                  A = ¾ · 120 = <Underline start={120}>90</Underline>
                </div>
                <div style={fadeUp(frame, 124, 20, 14)}>
                  B = ⅚ · 108 = <Underline start={136}>90</Underline>
                </div>
                <div style={fadeUp(frame, 142, 20, 14)}>
                  Obě hodnoty jsou stejné →{" "}
                  <Marker start={156}>správně je A = B</Marker>
                </div>
              </div>
            </Card>
          </div>
        }
      />
    </>
  );
};
