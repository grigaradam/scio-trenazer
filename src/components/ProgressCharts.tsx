"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ScorePoint {
  date: string;
  label: string;
  percent: number;
  percentile: number | null;
  verbal: number;
  analytic: number;
}

export function ScoreChart({ data }: { data: ScorePoint[] }) {
  if (data.length < 2)
    return <p className="py-8 text-center text-sm text-muted">Graf se ukáže po druhém dokončeném testu.</p>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ScorePoint;
              return (
                <div className="rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm shadow-lg">
                  <div className="font-bold">{p.label}</div>
                  <div>
                    Celkem <b>{p.percent} %</b>
                    {p.percentile !== null && <span className="text-muted"> · ≈ {p.percentile}. percentil</span>}
                  </div>
                  <div className="text-xs text-muted">
                    verbální {p.verbal} % · analytický {p.analytic} %
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="percent"
            stroke="var(--color-brand-500)"
            strokeWidth={2.5}
            dot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)", fill: "var(--color-brand-500)" }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** GitHub-style heatmap of daily study minutes (sequential, one hue). */
export function Heatmap({ days, goalMin }: { days: Record<string, { min: number; tasks: number }>; goalMin: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const weeks = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // Monday = 0
    const start = new Date(today.getTime() - (dow + 7 * 25) * 86400000);
    const cols: { key: string; future: boolean }[][] = [];
    for (let w = 0; w < 26; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * 86400000);
        col.push({ key: fmt.format(date), future: date > today });
      }
      cols.push(col);
    }
    return cols;
  }, []);
  const level = (min: number) => (min <= 0 ? 0 : min < goalMin * 0.34 ? 1 : min < goalMin * 0.67 ? 2 : min < goalMin ? 3 : 4);
  const colors = ["var(--surface-2)", "#ddd6fe", "#a78bfa", "#7c3aed", "#4c1d95"];
  const info = hover ? days[hover] : null;
  return (
    <div>
      <div className="scroll-thin overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]">
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((c) => {
                const v = days[c.key]?.min ?? 0;
                return (
                  <div
                    key={c.key}
                    onMouseEnter={() => setHover(c.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setHover(c.key)}
                    className="h-[13px] w-[13px] rounded-[3px] transition hover:ring-2 hover:ring-brand-400"
                    style={{ background: c.future ? "transparent" : colors[level(v)] }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="min-h-4">
          {hover
            ? `${new Date(hover).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "long" })}: ${info?.min ?? 0} min · ${info?.tasks ?? 0} úloh`
            : "Najeď na den pro detail"}
        </span>
        <span className="flex items-center gap-1">
          méně
          {colors.map((c) => (
            <i key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
          ))}
          denní cíl
        </span>
      </div>
    </div>
  );
}
