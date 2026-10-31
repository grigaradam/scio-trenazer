"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PetMood, PetStage, PetState } from "@/lib/pet";
import { PetAvatar } from "./PetAvatar";

const SHOW_MS = 12000;

/** What the pet asks for, by mood. Moods that need nothing aren't here – then it stays quiet. */
const ASK: Partial<Record<PetMood, { title: string; cta: string }>> = {
  hungry: { title: "Mám hlad!", cta: "🍎 Nakrmit úlohou" },
  tired: { title: "Nemám energii…", cta: "⚡ Pár minut učení" },
  down: { title: "Je mi smutno", cta: "💜 Rozveselit úlohou" },
  sad: { title: "Stýská se mi", cta: "💜 Potěšit úlohou" },
  asleep: { title: "Zzz… spím", cta: "⏰ Vzbudit úlohou" },
};

// never in the middle of a practice session or a test
const QUIET = ["/app/pet", "/app/practice/", "/app/tests/", "/app/onboarding"];

/**
 * A note from the pet when it actually needs something: at most once a day for each mood,
 * hunger only before the first task of the day and tiredness only after it.
 */
export function PetNudge({
  userId,
  day,
  stage,
  state,
  fedToday,
}: {
  userId: string;
  day: string;
  stage: PetStage["code"];
  state: PetState;
  fedToday: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ask = ASK[state.mood];
  const due = Boolean(ask) && (state.mood === "hungry" ? !fedToday : state.mood === "tired" ? fedToday : true);
  const key = `pet-nudge:${userId}`;

  useEffect(() => {
    if (!due || open || QUIET.some((q) => path.startsWith(q))) return;
    let seen: string[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { day: string; moods: string[] } | null;
      if (saved?.day === day) seen = saved.moods;
    } catch {}
    if (seen.includes(state.mood)) return;
    const t = setTimeout(() => {
      setOpen(true);
      try {
        localStorage.setItem(key, JSON.stringify({ day, moods: [...seen, state.mood] }));
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [due, open, path, key, day, state.mood]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(close, SHOW_MS);
    return () => clearTimeout(t);
  }, [open]);

  function close() {
    setLeaving(true);
    setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, 250);
  }

  if (!open || !ask) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--dock-top)+0.75rem)] z-40 flex justify-center sm:inset-x-auto sm:right-5 lg:bottom-5">
      <div
        role="status"
        className={clsx(
          "pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-3xl border-2 border-brand-200 bg-surface p-3 pr-9 shadow-xl dark:border-brand-800",
          leaving ? "animate-notice-out" : "animate-notice-in",
        )}
      >
        <div className="flex items-start gap-3">
          <Link href="/app/pet" onClick={close} className="shrink-0 rounded-2xl bg-brand-50 p-1 dark:bg-brand-900/40" aria-label="Za mazlíčkem">
            <PetAvatar stage={stage} mood={state.mood} needs={state} className="h-14 w-14" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-300">Mazlíček ti píše</div>
            <div className="font-display font-extrabold">{ask.title}</div>
            <p className="mt-0.5 text-sm text-muted">{state.message}</p>
            <Link
              href="/app/practice/mix"
              onClick={close}
              className="mt-2 inline-flex items-center rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-[0_3px_0_0_var(--color-brand-800)] transition active:translate-y-0.5 active:shadow-none"
            >
              {ask.cta}
            </Link>
          </div>
        </div>
        <button onClick={close} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Zavřít">
          <X className="h-4 w-4" />
        </button>
        <span className="absolute bottom-0 left-0 h-[3px] w-full origin-left animate-notice-timer bg-brand-500" style={{ animationDuration: `${SHOW_MS}ms` }} />
      </div>
    </div>
  );
}
