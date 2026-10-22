import { levelInfo } from "@/lib/gamification";
import { Ring } from "./ui";

export function StatPills({
  xp,
  streak,
  activeToday,
  todaySeconds,
  goalMin,
}: {
  xp: number;
  streak: number;
  activeToday: boolean;
  todaySeconds: number;
  goalMin: number;
}) {
  const lvl = levelInfo(xp);
  const goal = Math.min(1, todaySeconds / 60 / goalMin);
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div
        className={`flex items-center gap-1 rounded-2xl px-2.5 py-1.5 font-display text-base font-extrabold ${activeToday ? "text-orange-500" : "text-muted"}`}
        title={activeToday ? "Dnes máš splněno – streak pokračuje" : "Vyřeš dnes aspoň jednu úlohu, ať neztratíš streak"}
      >
        <span className={activeToday ? "inline-block animate-flame" : "grayscale"}>🔥</span>
        {streak}
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 font-display text-base font-extrabold text-brand-600 dark:text-brand-300" title={`Level ${lvl.level} – do dalšího levelu ${lvl.toNext} XP`}>
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-600 text-xs text-white">{lvl.level}</span>
        {xp} <span className="text-xs font-bold text-muted">XP</span>
      </div>
      <div title={`Denní cíl: ${Math.round(todaySeconds / 60)} / ${goalMin} min`}>
        <Ring value={goal} size={36} stroke={5} color={goal >= 1 ? "#10b981" : "var(--color-brand-500)"}>
          <span className="text-[10px]">{goal >= 1 ? "✓" : `${Math.round(goal * 100)}%`}</span>
        </Ring>
      </div>
    </div>
  );
}
