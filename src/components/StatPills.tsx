"use client";

import { useEffect, useState } from "react";
import { compactXp, levelInfo } from "@/lib/gamification";
import { onLiveStats } from "@/lib/liveStats";
import { Ring } from "./ui";

export function StatPills({
  xp: initialXp,
  streak: initialStreak,
  activeToday: initialActive,
  todaySeconds: initialSeconds,
  goalMin,
  layout = "row",
}: {
  xp: number;
  streak: number;
  activeToday: boolean;
  todaySeconds: number;
  goalMin: number;
  /** row = the phone header; card = the narrow desktop sidebar, three equal columns that never overflow */
  layout?: "row" | "card";
}) {
  const [xp, setXp] = useState(initialXp);
  const [streak, setStreak] = useState(initialStreak);
  const [activeToday, setActiveToday] = useState(initialActive);
  const [seconds, setSeconds] = useState(initialSeconds);
  const [bump, setBump] = useState(0);

  // fresh server values (navigation / refresh) win over the local counters
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setXp(initialXp);
    setStreak(initialStreak);
    setActiveToday(initialActive);
    setSeconds((s) => Math.max(s, initialSeconds));
  }, [initialXp, initialStreak, initialActive, initialSeconds]);

  useEffect(
    () =>
      onLiveStats((e) => {
        if (e.type === "tick") setSeconds((s) => s + e.seconds);
        else {
          setXp((x) => x + e.xp);
          setActiveToday(true);
          if (e.streak) setStreak(e.streak);
          if (e.xp > 0) setBump((b) => b + 1);
        }
      }),
    [],
  );

  const lvl = levelInfo(xp);
  const goal = Math.min(1, seconds / 60 / goalMin);
  const streakTitle = activeToday ? "Dnes máš splněno – streak pokračuje" : "Vyřeš dnes aspoň jednu úlohu, ať neztratíš streak";
  const xpTitle = `${xp.toLocaleString("cs-CZ")} XP · level ${lvl.level} – do dalšího levelu ${lvl.toNext.toLocaleString("cs-CZ")} XP`;
  const goalTitle = `Denní cíl: ${Math.floor(seconds / 60)} / ${goalMin} min`;
  const ring = (size: number) => (
    <Ring value={goal} size={size} stroke={size > 32 ? 5 : 4} color={goal >= 1 ? "#10b981" : "var(--color-brand-500)"}>
      <span className="text-[10px]">{goal >= 1 ? "✓" : `${Math.floor(goal * 100)}%`}</span>
    </Ring>
  );

  if (layout === "card")
    return (
      <div className="grid grid-cols-3 divide-x-2 divide-border rounded-2xl border-2 border-border bg-surface py-2.5 text-center">
        <div className="min-w-0 px-1" title={streakTitle}>
          <div className={`flex h-8 items-center justify-center gap-1 font-display text-lg font-extrabold tabular-nums ${activeToday ? "text-orange-500" : "text-muted"}`}>
            <span className={activeToday ? "inline-block animate-flame" : "grayscale"}>🔥</span>
            <span className="truncate">{streak}</span>
          </div>
          <div className="text-[11px] font-bold text-muted">{streak === 1 ? "den" : streak > 1 && streak < 5 ? "dny" : "dní"}</div>
        </div>
        <div key={bump} className={`min-w-0 px-1 ${bump ? "animate-pop" : ""}`} title={xpTitle}>
          <div className="flex h-8 items-center justify-center truncate font-display text-lg font-extrabold tabular-nums text-brand-600 dark:text-brand-300">
            {compactXp(xp)}
          </div>
          <div className="truncate text-[11px] font-bold text-muted">XP · lvl {lvl.level}</div>
        </div>
        <div className="flex min-w-0 flex-col items-center px-1" title={goalTitle}>
          <div className="flex h-8 items-center">{ring(30)}</div>
          <div className="text-[11px] font-bold text-muted">denní cíl</div>
        </div>
      </div>
    );

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-2xl px-2.5 py-1.5 font-display text-base font-extrabold tabular-nums ${activeToday ? "text-orange-500" : "text-muted"}`}
        title={streakTitle}
      >
        <span className={activeToday ? "inline-block animate-flame" : "grayscale"}>🔥</span>
        {streak}
      </div>
      <div
        key={bump}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl px-2.5 py-1.5 font-display text-base font-extrabold tabular-nums text-brand-600 dark:text-brand-300 ${bump ? "animate-pop" : ""}`}
        title={xpTitle}
      >
        <span className="grid h-6 min-w-6 place-items-center rounded-lg bg-brand-600 px-1 text-xs text-white">{lvl.level}</span>
        {compactXp(xp)} <span className="text-xs font-bold text-muted">XP</span>
      </div>
      <div className="shrink-0" title={goalTitle}>
        {ring(36)}
      </div>
    </div>
  );
}
