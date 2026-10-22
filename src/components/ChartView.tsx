"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartSpec } from "@/lib/content/types";

// Categorical slots in fixed order (validated palette; light/dark steps live in globals.css).
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

const H = 300;
const M = { top: 16, right: 10, bottom: 56, left: 46 };
/** Round SVG coordinates (identical server/client output, smaller DOM). */
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Width of the chart container in CSS px, so text keeps its real size on phones. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

const fmt = (v: number) => v.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

/** Splits a long category label into at most two lines. */
function labelLines(s: string, max = 12) {
  if (s.length <= max) return [s];
  const words = s.split(" ");
  let a = "";
  let i = 0;
  while (i < words.length && (a + " " + words[i]).trim().length <= max) a = (a + " " + words[i++]).trim();
  const b = words.slice(i).join(" ");
  return a ? [a, b.length > max + 4 ? b.slice(0, max + 2) + "…" : b] : [s.slice(0, max) + "…"];
}

export function ChartView({ chart }: { chart: ChartSpec }) {
  const { ref, w } = useWidth();
  return (
    <figure className="chart-root select-none">
      {chart.title && <figcaption className="mb-2 text-center text-sm font-bold">{chart.title}</figcaption>}
      <div ref={ref}>
        {chart.kind === "pie" ? <Pie chart={chart} W={w} /> : <Cartesian chart={chart} W={w} />}
      </div>
      {(chart.series.length > 1 || chart.kind === "pie") && (
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
          {(chart.kind === "pie" ? chart.categories : chart.series.map((s) => s.name)).map((name, i) => (
            <span key={name} className="flex items-center gap-1.5">
              <i className="h-3 w-3 rounded-[3px]" style={{ background: SERIES[i % SERIES.length] }} />
              {name}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

type ChartProps = {
  chart: ChartSpec;
  W: number;
};

function Cartesian({ chart, W }: ChartProps) {
  const n = chart.categories.length;
  const step = chart.yStep && chart.yStep > 0 ? chart.yStep : 1;
  const totals = chart.categories.map((_, i) => chart.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const rawMax = chart.kind === "stacked" ? Math.max(...totals) : Math.max(...chart.series.flatMap((s) => s.values));
  const max = Math.max(step, Math.ceil(rawMax / step) * step);
  const pw = W - M.left - M.right;
  const band0 = pw / n;
  // rotate category labels when they don't fit horizontally
  const longest = Math.max(...chart.categories.map((c) => c.length));
  const rotate = longest * 6.6 > band0 - 4;
  const bottom = rotate ? Math.min(110, 28 + longest * 4.9) + (chart.xLabel ? 18 : 0) : M.bottom;
  const HH = H + (rotate ? bottom - M.bottom : 0);
  const ph = HH - M.top - bottom;
  const y = (v: number) => r2(M.top + ph - (v / max) * ph);
  const band = band0;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const labelEvery = ticks.length > 8 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${HH}`} className="h-auto w-full" role="img" aria-label={chart.title ?? "Graf"}>
      {/* grid + y labels */}
      {ticks.map((t, i) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.5 : 1} />
          {i % labelEvery === 0 && (
            <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--muted)">
              {fmt(t)}
            </text>
          )}
        </g>
      ))}
      {chart.yLabel && (
        <text x={14} y={M.top + ph / 2} transform={`rotate(-90 14 ${M.top + ph / 2})`} textAnchor="middle" fontSize="12" fill="var(--muted)">
          {chart.yLabel}
          {chart.unit ? ` [${chart.unit}]` : ""}
        </text>
      )}

      {/* x labels */}
      {chart.categories.map((c, i) => {
        const cx = r2(M.left + band * (i + 0.5));
        const ty = HH - bottom + 16;
        return rotate ? (
          <text key={c + i} x={cx} y={ty} transform={`rotate(-40 ${cx} ${ty})`} textAnchor="end" fontSize="12" fill="var(--text)">
            {c.length > 22 ? c.slice(0, 21) + "…" : c}
          </text>
        ) : (
          <text key={c + i} x={cx} y={ty} textAnchor="middle" fontSize="12" fill="var(--text)">
            {labelLines(c, Math.max(6, Math.floor(band / 7))).map((line, li) => (
              <tspan key={li} x={cx} dy={li ? 14 : 0}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
      {chart.xLabel && (
        <text x={r2(M.left + pw / 2)} y={HH - 6} textAnchor="middle" fontSize="12" fill="var(--muted)">
          {chart.xLabel}
        </text>
      )}

      {/* marks */}
      {chart.kind === "line"
        ? chart.series.map((s, si) => {
            const pts = s.values.map((v, i) => [r2(M.left + band * (i + 0.5)), y(v)] as const);
            return (
              <g key={s.name}>
                <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={SERIES[si]} strokeWidth={2.5} strokeLinejoin="round" />
                {pts.map(([px, py], i) => (
                  <g key={i}>
                    <circle cx={px} cy={py} r={5} fill={SERIES[si]} stroke="var(--surface)" strokeWidth={2} />
                  </g>
                ))}
              </g>
            );
          })
        : chart.categories.map((_, i) => {
            const gw = band * 0.72;
            const x0 = r2(M.left + band * i + (band - gw) / 2);
            if (chart.kind === "stacked") {
              let acc = 0;
              return (
                <g key={i}>
                  {chart.series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    const top = y(acc + v);
                    const h = y(acc) - top;
                    acc += v;
                    return (
                      <rect
                        key={si}
                        x={x0}
                        y={r2(top + (si ? 1 : 0))}
                        width={r2(gw)}
                        height={r2(Math.max(0, h - (si ? 1 : 0)))}
                        rx={si === chart.series.length - 1 ? 4 : 0}
                        fill={SERIES[si]}
                        stroke="var(--surface)"
                        strokeWidth={1}
                       
                      />
                    );
                  })}
                </g>
              );
            }
            const bw = (gw - (chart.series.length - 1) * 2) / chart.series.length;
            return (
              <g key={i}>
                {chart.series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const top = y(v);
                  const h = y(0) - top;
                  const x = r2(x0 + si * (bw + 2));
                  const r = r2(Math.min(4, bw / 2, h));
                  return (
                    <path
                      key={si}
                      d={`M${x},${y(0)} V${r2(top + r)} Q${x},${top} ${r2(x + r)},${top} H${r2(x + bw - r)} Q${r2(x + bw)},${top} ${r2(x + bw)},${r2(top + r)} V${y(0)} Z`}
                      fill={SERIES[si]}
                     
                    />
                  );
                })}
              </g>
            );
          })}
    </svg>
  );
}

function Pie({ chart, W }: ChartProps) {
  const values = chart.series[0]?.values ?? [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = W / 2;
  const r = Math.min(110, W / 2 - 70);
  const cy = r + 30;
  const PH = 2 * r + 60;
  const starts = values.reduce<number[]>((acc, v, i) => [...acc, (acc[i] ?? -Math.PI / 2) + (v / total) * Math.PI * 2], [-Math.PI / 2]);
  return (
    <svg viewBox={`0 0 ${W} ${PH}`} className="h-auto w-full" role="img" aria-label={chart.title ?? "Koláčový graf"}>
      {values.map((v, i) => {
        const a0 = starts[i];
        const a1 = starts[i + 1];
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p0 = [r2(cx + r * Math.cos(a0)), r2(cy + r * Math.sin(a0))];
        const p1 = [r2(cx + r * Math.cos(a1)), r2(cy + r * Math.sin(a1))];
        const mid = (a0 + a1) / 2;
        const pct = Math.round((v / total) * 1000) / 10;
        const lx = r2(cx + (r + 14) * Math.cos(mid));
        const ly = r2(cy + (r + 14) * Math.sin(mid));
        return (
          <g key={i}>
            <path
              d={values.length === 1 ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0` : `M${cx},${cy} L${p0[0]},${p0[1]} A${r},${r} 0 ${large} 1 ${p1[0]},${p1[1]} Z`}
              fill={SERIES[i % SERIES.length]}
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <text x={lx} y={ly} textAnchor={Math.cos(mid) > 0.2 ? "start" : Math.cos(mid) < -0.2 ? "end" : "middle"} dominantBaseline="middle" fontSize="14" fontWeight="700" fill="var(--text)">
              {fmt(pct)} %
            </text>
          </g>
        );
      })}
    </svg>
  );
}
