import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";
import { C, clamp, display, easeInOut, easeOut } from "../theme";
import { Accent, Card, FeatureLayout, SceneText, usePop } from "../ui";
import { Sfx } from "../audio";

const scores = [38, 45, 43, 55, 61, 68, 76];
const CW = 720;
const CH = 250;
const pts = scores.map(
  (s, i) =>
    [(i / (scores.length - 1)) * CW, CH - ((s - 20) / 70) * CH] as const,
);
const line = pts
  .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
  .join(" ");
const area = `${line} L${CW} ${CH} L0 ${CH} Z`;

const heat = ["#efedf6", "#ddd6fe", "#a78bfa", "#7c3aed", "#5b21b6"];
const ROWS = 7;
const COLS = 14;

const typeBars = [
  { name: "Slovní analogie", value: 86, color: C.brand500 },
  { name: "Grafy a tabulky", value: 72, color: C.teal500 },
  { name: "Dostatečnost údajů", value: 58, color: C.orange },
];

export const ProgressScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cards = usePop(10, 15);
  const draw = interpolate(frame, [24, 84], [0, 1], {
    ...clamp,
    easing: easeInOut,
  });
  const label = usePop(84, 10);

  return (
    <>
      <Sfx name="whoosh" at={8} volume={0.25} />
      {scores.map((s, i) => (
        <Sfx key={i} name="tick" at={24 + i * 10} volume={0.2} />
      ))}
      <Sfx name="pop" at={84} volume={0.4} />
      <Sfx name="sparkle" at={84} volume={0.2} />
      <FeatureLayout
        left={
          <SceneText
            kicker="📈 Pokrok"
            title={
              <>
                Vidíš, jak <Accent>rosteš</Accent>
              </>
            }
            subtitle="Graf výsledků, heatmapa času a úspěšnost po typech úloh. Víš přesně, kde přidat."
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
            <Card style={{ padding: "34px 40px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 20,
                }}
              >
                <span
                  style={{ fontFamily: display, fontWeight: 800, fontSize: 36 }}
                >
                  Výsledky testů
                </span>
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: C.green,
                    opacity: label,
                  }}
                >
                  +38 % od začátku
                </span>
              </div>
              <svg
                width={CW + 40}
                height={CH + 30}
                viewBox={`-20 -20 ${CW + 40} ${CH + 30}`}
                style={{ overflow: "visible" }}
              >
                <defs>
                  <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={C.brand500}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={C.brand500}
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="stroke" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={C.brand500} />
                    <stop offset="100%" stopColor={C.teal500} />
                  </linearGradient>
                  <clipPath id="reveal">
                    <rect
                      x={-20}
                      y={-40}
                      width={(CW + 40) * draw}
                      height={CH + 60}
                    />
                  </clipPath>
                </defs>
                {[0, 1, 2, 3].map((i) => (
                  <line
                    key={i}
                    x1={0}
                    x2={CW}
                    y1={(i / 3) * CH}
                    y2={(i / 3) * CH}
                    stroke={C.border}
                    strokeWidth={2}
                    strokeDasharray="6 8"
                  />
                ))}
                <path d={area} fill="url(#area)" clipPath="url(#reveal)" />
                <path
                  d={line}
                  fill="none"
                  stroke="url(#stroke)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - draw}
                />
                {pts.map(([x, y], i) => {
                  const at = 24 + (i / (pts.length - 1)) * 60;
                  const s = interpolate(frame, [at, at + 8], [0, 1], {
                    ...clamp,
                    easing: easeOut,
                  });
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={11 * s}
                      fill="#fff"
                      stroke={i === pts.length - 1 ? C.teal500 : C.brand500}
                      strokeWidth={6}
                    />
                  );
                })}
                <g
                  transform={`translate(${pts[pts.length - 1][0] - 70} ${pts[pts.length - 1][1] - 74})`}
                  opacity={label}
                >
                  <rect width={110} height={52} rx={16} fill={C.teal500} />
                  <text
                    x={55}
                    y={36}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={30}
                    fontWeight={800}
                    fontFamily={display}
                  >
                    76 %
                  </text>
                </g>
              </svg>
            </Card>

            <div style={{ display: "flex", gap: 28 }}>
              <Card style={{ padding: 32 }}>
                <div
                  style={{
                    fontFamily: display,
                    fontWeight: 800,
                    fontSize: 30,
                    marginBottom: 18,
                  }}
                >
                  Čas učení
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${COLS}, 20px)`,
                    gap: 6,
                  }}
                >
                  {new Array(ROWS * COLS).fill(0).map((_, k) => {
                    const r = k % ROWS;
                    const c = Math.floor(k / ROWS);
                    const growth = c / COLS;
                    const v = Math.min(
                      4,
                      Math.floor(random(`h-${k}`) * 3 + growth * 2.6),
                    );
                    const at = 34 + (c + r) * 1.6;
                    const on = interpolate(frame, [at, at + 6], [0, 1], clamp);
                    return (
                      <div
                        key={k}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          backgroundColor: on > 0.5 ? heat[v] : heat[0],
                          scale: 0.6 + on * 0.4,
                        }}
                      />
                    );
                  })}
                </div>
              </Card>
              <Card
                style={{
                  flex: 1,
                  padding: 32,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div
                  style={{ fontFamily: display, fontWeight: 800, fontSize: 30 }}
                >
                  Úspěšnost po typech
                </div>
                {typeBars.map((b, i) => {
                  const p = interpolate(
                    frame,
                    [50 + i * 10, 90 + i * 10],
                    [0, 1],
                    { ...clamp, easing: easeOut },
                  );
                  return (
                    <div key={b.name}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 22,
                          fontWeight: 700,
                          marginBottom: 6,
                        }}
                      >
                        <span>{b.name}</span>
                        <span style={{ color: C.muted }}>
                          {Math.round(b.value * p)} %
                        </span>
                      </div>
                      <div
                        style={{
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: C.surface2,
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 8,
                            width: `${b.value * p}%`,
                            backgroundColor: b.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          </div>
        }
      />
    </>
  );
};
