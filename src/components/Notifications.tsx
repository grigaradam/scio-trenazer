"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { achievementDef, ACHIEVEMENT_CATEGORIES, levelEmoji, levelThreshold, levelTitle } from "@/lib/gamification";
import { announceRewards, onNotify, type Notice } from "@/lib/notify";
import { PET_STAGES } from "@/lib/pet";
import { playSound } from "@/lib/sounds";

const SHOW_MS = 5000;

type Item = Notice & { id: number; leaving?: boolean };

let nextId = 0;

/** Small cards top-right (top on phones) for new achievements and level-ups; stack, then fade away. */
export function Notifications() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(
    () =>
      onNotify((notices) => {
        playSound("reward");
        // level-up goes on top, it's the bigger news
        const sorted = [...notices].sort((a, b) => (a.kind === "level" ? -1 : 0) - (b.kind === "level" ? -1 : 0));
        setItems((list) => [...sorted.map((n) => ({ ...n, id: ++nextId })), ...list].slice(0, 4));
      }),
    [],
  );

  function dismiss(id: number) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, leaving: true } : i)));
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 250);
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-16 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end lg:top-6"
    >
      {items.map((item, i) => (
        <NoticeCard key={item.id} item={item} delay={i} onDone={() => dismiss(item.id)} />
      ))}
    </div>
  );
}

function NoticeCard({ item, delay, onDone }: { item: Item; delay: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, SHOW_MS + delay * 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let icon: React.ReactNode;
  let label: string;
  let title: string;
  let detail: string;
  if (item.kind === "level") {
    const next = levelThreshold(item.level + 1) - levelThreshold(item.level);
    icon = (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 font-display text-lg font-extrabold text-white shadow-[0_3px_0_0_var(--color-brand-800)]">
        {item.level}
      </span>
    );
    label = "Level up";
    title = `${levelEmoji(item.level)} ${levelTitle(item.level)}`;
    const grown = PET_STAGES.find((st) => st.level === item.level);
    detail = grown ? `Mazlíček se proměnil: ${grown.title} 🐾` : `Level ${item.level} · další za ${next} XP`;
  } else {
    const a = achievementDef(item.code);
    if (!a) return null;
    icon = <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-2xl dark:bg-amber-900/40">{a.emoji}</span>;
    label = `Achievement · ${ACHIEVEMENT_CATEGORIES.find((c) => c.code === a.category)?.title ?? ""}`;
    title = a.title;
    detail = `+${a.xp} XP`;
  }

  return (
    <div
      role="status"
      className={clsx(
        "pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl border-2 bg-surface py-2.5 pl-2.5 pr-9 shadow-lg",
        item.kind === "level" ? "border-brand-300 dark:border-brand-700" : "border-amber-300 dark:border-amber-700",
        item.leaving ? "animate-notice-out" : "animate-notice-in",
      )}
    >
      {icon}
      <Link href={item.kind === "level" ? "/app/pet" : "/app/progress#achievementy"} className="min-w-0 flex-1" onClick={onDone}>
        <div
          className={clsx(
            "truncate text-[11px] font-extrabold uppercase tracking-wider",
            item.kind === "level" ? "text-brand-600 dark:text-brand-300" : "text-amber-700 dark:text-amber-300",
          )}
        >
          {label}
        </div>
        <div className="truncate font-display font-extrabold">{title}</div>
        <div className="text-xs font-bold text-muted">{detail}</div>
      </Link>
      <button onClick={onDone} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Zavřít">
        <X className="h-4 w-4" />
      </button>
      <span
        className={clsx("absolute bottom-0 left-0 h-[3px] origin-left animate-notice-timer", item.kind === "level" ? "bg-brand-500" : "bg-amber-400")}
        style={{ animationDuration: `${SHOW_MS + delay * 600}ms`, width: "100%" }}
      />
    </div>
  );
}

/** Fires notices once after the page mounts (for rewards found while rendering a server page). */
export function Announce({ codes, levelUp }: { codes: string[]; levelUp: number | null }) {
  useEffect(() => {
    // wait a beat so <Notifications /> (rendered after the page) is listening
    const t = setTimeout(() => announceRewards({ achievements: codes, levelUp }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
