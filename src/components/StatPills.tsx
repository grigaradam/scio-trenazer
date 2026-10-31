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
}: {
  xp: number;
  streak: number;
  activeToday: boolean;
  todaySeconds: number;
  goalMin: number;
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
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-2xl px-2.5 py-1.5 font-display text-base font-extrabold tabular-nums ${activeToday ? "text-orange-500" : "text-muted"}`}
        title={activeToday ? "Dnes máš splněno – streak pokračuje" : "Vyřeš dnes aspoň jednu úlohu, ať neztratíš streak"}
      >
        <span className={activeToday ? "inline-block animate-flame" : "grayscale"}>🔥</span>
        {streak}
      </div>
      <div
        key={bump}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl px-2.5 py-1.5 font-display text-base font-extrabold tabular-nums text-brand-600 dark:text-brand-300 ${bump ? "animate-pop" : ""}`}
        title={`${xp.toLocaleString("cs-CZ")} XP · level ${lvl.level} – do dalšího levelu ${lvl.toNext.toLocaleString("cs-CZ")} XP`}
      >
        <span className="grid h-6 min-w-6 place-items-center rounded-lg bg-brand-600 px-1 text-xs text-white">{lvl.level}</span>
        {compactXp(xp)} <span className="text-xs font-bold text-muted">XP</span>
      </div>
      <div className="shrink-0" title={`Denní cíl: ${Math.floor(seconds / 60)} / ${goalMin} min`}>
        <Ring value={goal} size={36} stroke={5} color={goal >= 1 ? "#10b981" : "var(--color-brand-500)"}>
          <span className="text-[10px]">{goal >= 1 ? "✓" : `${Math.floor(goal * 100)}%`}</span>
        </Ring>
      </div>
    </div>
  );
}
